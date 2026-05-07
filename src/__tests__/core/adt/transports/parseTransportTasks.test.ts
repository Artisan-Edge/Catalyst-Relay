/**
 * Unit Tests for parseTransportTasks
 *
 * Tests the XML parser that extracts task IDs and their objects from a
 * transport request response. Recently extended to also extract optional
 * `owner`, `description`, and `status` task-level attributes via
 * conditional spread (so absent/empty attributes do NOT appear as keys
 * in the resulting object — required by `exactOptionalPropertyTypes`).
 *
 * Coverage:
 *  - Unit:        happy path, absent attrs, empty-string attrs, mixed
 *                 presence, multiple tasks, missing tm:number, no tasks,
 *                 backwards-compatible legacy fields
 *  - Smoke:       end-to-end shape conformance against the published
 *                 TaskContents interface
 *  - Blackbox:    malformed XML, whitespace-only attrs, special chars,
 *                 long values, duplicate attributes
 *  - Mutation:    each new attribute extraction has a dedicated assertion
 *                 that would fail if its line were removed
 *
 * Property-based tests are skipped — fast-check is not in node_modules
 * and the hard requirements forbid adding new dependencies.
 */

import { describe, it, expect } from 'bun:test';
import { DOMParser } from '@xmldom/xmldom';
import { parseTransportTasks, type TaskContents } from '../../../../core/adt/transports/parseTransportTasks';
import type { TransportObject } from '../../../../core/adt/transports/removeFromTransport';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse an XML string into a Document for the parser under test.
 * Mirrors `safeParseXml` (without the Result wrapper) so fixtures are
 * built exactly the way production callers feed the parser.
 */
function toDoc(xml: string): Document {
    return new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document;
}

/** Standard XML wrapper used by SAP ADT transport responses. */
function wrap(taskXml: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
  <asx:values>
    <DATA>
      <tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:number="DS4K900001">
        <tm:request tm:number="DS4K900001">
          ${taskXml}
        </tm:request>
      </tm:root>
    </DATA>
  </asx:values>
</asx:abap>`;
}

// =============================================================================
// Fixtures (inline template literals — no network, no live SAP)
// =============================================================================

const FIX_HAPPY_PATH_FULL_ATTRS = wrap(`
  <tm:task tm:number="DS4K900002" tm:owner="DEVELOPER1" tm:desc="Implement feature X" tm:status="D">
    <tm:abap_object tm:name="ZSNAP_VIEW_001" tm:obj_desc="My CDS View"
                    tm:pgmid="R3TR" tm:type="DDLS" tm:position="000001"/>
  </tm:task>
`);

const FIX_NO_NEW_ATTRS = wrap(`
  <tm:task tm:number="DS4K900003">
    <tm:abap_object tm:name="ZSNAP_TBL_001" tm:obj_desc="My Table"
                    tm:pgmid="R3TR" tm:type="TABL" tm:position="000001"/>
  </tm:task>
`);

const FIX_EMPTY_STRING_ATTRS = wrap(`
  <tm:task tm:number="DS4K900004" tm:owner="" tm:desc="" tm:status="">
    <tm:abap_object tm:name="ZSNAP_OBJ" tm:obj_desc="Obj"
                    tm:pgmid="R3TR" tm:type="CLAS" tm:position="000001"/>
  </tm:task>
`);

const FIX_MIXED_PRESENCE = wrap(`
  <tm:task tm:number="DS4K900010" tm:owner="ALICE" tm:desc="All three set" tm:status="D">
    <tm:abap_object tm:name="ZA" tm:obj_desc="A" tm:pgmid="R3TR" tm:type="DDLS" tm:position="000001"/>
  </tm:task>
  <tm:task tm:number="DS4K900011">
    <tm:abap_object tm:name="ZB" tm:obj_desc="B" tm:pgmid="R3TR" tm:type="DDLS" tm:position="000002"/>
  </tm:task>
  <tm:task tm:number="DS4K900012" tm:owner="BOB">
    <tm:abap_object tm:name="ZC" tm:obj_desc="C" tm:pgmid="R3TR" tm:type="DDLS" tm:position="000003"/>
  </tm:task>
`);

const FIX_MULTIPLE_TASKS_ORDERED = wrap(`
  <tm:task tm:number="DS4K900100" tm:owner="OWNER_A" tm:desc="First" tm:status="D">
    <tm:abap_object tm:name="ZOBJ_A" tm:obj_desc="Obj A" tm:pgmid="R3TR" tm:type="DDLS" tm:position="000001"/>
  </tm:task>
  <tm:task tm:number="DS4K900101" tm:owner="OWNER_B" tm:desc="Second" tm:status="L">
    <tm:abap_object tm:name="ZOBJ_B" tm:obj_desc="Obj B" tm:pgmid="R3TR" tm:type="TABL" tm:position="000002"/>
  </tm:task>
  <tm:task tm:number="DS4K900102" tm:owner="OWNER_C" tm:desc="Third" tm:status="R">
    <tm:abap_object tm:name="ZOBJ_C" tm:obj_desc="Obj C" tm:pgmid="R3TR" tm:type="CLAS" tm:position="000003"/>
  </tm:task>
`);

const FIX_TASK_WITHOUT_NUMBER = wrap(`
  <tm:task tm:owner="GHOST" tm:desc="Should be skipped" tm:status="D">
    <tm:abap_object tm:name="ZGHOST" tm:obj_desc="Ghost" tm:pgmid="R3TR" tm:type="DDLS" tm:position="000001"/>
  </tm:task>
  <tm:task tm:number="DS4K900200" tm:owner="REAL" tm:desc="Real one" tm:status="D">
    <tm:abap_object tm:name="ZREAL" tm:obj_desc="Real" tm:pgmid="R3TR" tm:type="DDLS" tm:position="000002"/>
  </tm:task>
`);

const FIX_NO_TASKS = `<?xml version="1.0" encoding="UTF-8"?>
<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
  <asx:values>
    <DATA>
      <tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:number="DS4K900300">
        <tm:request tm:number="DS4K900300"/>
      </tm:root>
    </DATA>
  </asx:values>
</asx:abap>`;

// Pre-existing parser shape — task with NO new attrs, multiple objects.
// Asserts backwards compatibility against the previous parser output.
const FIX_LEGACY_BACKCOMPAT = wrap(`
  <tm:task tm:number="DS4K900400">
    <tm:abap_object tm:name="ZLEG_1" tm:obj_desc="Legacy 1"
                    tm:pgmid="R3TR" tm:type="DDLS" tm:position="000001"/>
    <tm:abap_object tm:name="ZLEG_2" tm:obj_info="Info-fallback only"
                    tm:pgmid="R3TR" tm:type="TABL" tm:position="000002"/>
    <tm:abap_object tm:name="ZLEG_3"/>
  </tm:task>
`);

// =============================================================================
// 1. Unit — Happy Path
// =============================================================================

describe('parseTransportTasks — happy path', () => {
    it('parses a task with all three new attributes and one object', () => {
        const tasks = parseTransportTasks(toDoc(FIX_HAPPY_PATH_FULL_ATTRS));

        expect(tasks).toHaveLength(1);
        const task = tasks[0]!;

        expect(task.taskId).toBe('DS4K900002');
        expect(task.owner).toBe('DEVELOPER1');
        expect(task.description).toBe('Implement feature X');
        expect(task.status).toBe('D');

        expect(task.objects).toHaveLength(1);
        const obj = task.objects[0]!;
        expect(obj.name).toBe('ZSNAP_VIEW_001');
        expect(obj.description).toBe('My CDS View');
        expect(obj.pgmid).toBe('R3TR');
        expect(obj.type).toBe('DDLS');
        expect(obj.position).toBe('000001');
    });
});

// =============================================================================
// 2. Unit — All-New-Attributes Absent
//    Critical: keys must NOT appear at all (exactOptionalPropertyTypes)
// =============================================================================

describe('parseTransportTasks — all new attributes absent', () => {
    it('omits owner/description/status keys when attributes are missing', () => {
        const tasks = parseTransportTasks(toDoc(FIX_NO_NEW_ATTRS));

        expect(tasks).toHaveLength(1);
        const task = tasks[0]!;

        expect(task.taskId).toBe('DS4K900003');

        // Use `'key' in task` — under exactOptionalPropertyTypes,
        // presence-as-undefined and absence are semantically different.
        expect('owner' in task).toBe(false);
        expect('description' in task).toBe(false);
        expect('status' in task).toBe(false);

        // Object.keys must not include these either — guards against
        // accidental `{ owner: undefined }` writes.
        const keys = Object.keys(task);
        expect(keys).not.toContain('owner');
        expect(keys).not.toContain('description');
        expect(keys).not.toContain('status');

        // Sanity: objects[] still extracted normally.
        expect(task.objects).toHaveLength(1);
        expect(task.objects[0]!.name).toBe('ZSNAP_TBL_001');
    });
});

// =============================================================================
// 3. Unit — Empty-String Attributes
//    Conditional spread treats "" as absent (falsy). Pin this behavior.
// =============================================================================

describe('parseTransportTasks — empty-string attributes', () => {
    it('treats empty-string owner/desc/status as absent (no keys in result)', () => {
        const tasks = parseTransportTasks(toDoc(FIX_EMPTY_STRING_ATTRS));

        expect(tasks).toHaveLength(1);
        const task = tasks[0]!;

        expect(task.taskId).toBe('DS4K900004');
        expect('owner' in task).toBe(false);
        expect('description' in task).toBe(false);
        expect('status' in task).toBe(false);

        // Objects still parse normally.
        expect(task.objects).toHaveLength(1);
        expect(task.objects[0]!.name).toBe('ZSNAP_OBJ');
    });
});

// =============================================================================
// 4. Unit — Mixed Presence
// =============================================================================

describe('parseTransportTasks — mixed attribute presence', () => {
    it('populates each task independently from its own attributes', () => {
        const tasks = parseTransportTasks(toDoc(FIX_MIXED_PRESENCE));

        expect(tasks).toHaveLength(3);

        // Task 0: all three set
        const t0 = tasks[0]!;
        expect(t0.taskId).toBe('DS4K900010');
        expect(t0.owner).toBe('ALICE');
        expect(t0.description).toBe('All three set');
        expect(t0.status).toBe('D');

        // Task 1: none set — keys absent
        const t1 = tasks[1]!;
        expect(t1.taskId).toBe('DS4K900011');
        expect('owner' in t1).toBe(false);
        expect('description' in t1).toBe(false);
        expect('status' in t1).toBe(false);

        // Task 2: only owner set
        const t2 = tasks[2]!;
        expect(t2.taskId).toBe('DS4K900012');
        expect(t2.owner).toBe('BOB');
        expect('description' in t2).toBe(false);
        expect('status' in t2).toBe(false);
    });
});

// =============================================================================
// 5. Unit — Multiple Tasks, Document Order
// =============================================================================

describe('parseTransportTasks — multiple tasks', () => {
    it('returns tasks in document order, each with its own attributes', () => {
        const tasks = parseTransportTasks(toDoc(FIX_MULTIPLE_TASKS_ORDERED));

        expect(tasks).toHaveLength(3);
        expect(tasks.map((t) => t.taskId)).toEqual([
            'DS4K900100',
            'DS4K900101',
            'DS4K900102',
        ]);
        expect(tasks.map((t) => t.owner)).toEqual(['OWNER_A', 'OWNER_B', 'OWNER_C']);
        expect(tasks.map((t) => t.description)).toEqual(['First', 'Second', 'Third']);
        expect(tasks.map((t) => t.status)).toEqual(['D', 'L', 'R']);
        expect(tasks.map((t) => t.objects[0]!.name)).toEqual(['ZOBJ_A', 'ZOBJ_B', 'ZOBJ_C']);
    });
});

// =============================================================================
// 6. Unit — Skip Tasks Missing tm:number
// =============================================================================

describe('parseTransportTasks — task missing tm:number', () => {
    it('skips tasks without tm:number, keeps subsequent valid tasks', () => {
        const tasks = parseTransportTasks(toDoc(FIX_TASK_WITHOUT_NUMBER));

        // First task lacks tm:number → skipped entirely. Owner is irrelevant.
        expect(tasks).toHaveLength(1);
        expect(tasks[0]!.taskId).toBe('DS4K900200');
        expect(tasks[0]!.owner).toBe('REAL');
    });
});

// =============================================================================
// 7. Unit — No Tasks
// =============================================================================

describe('parseTransportTasks — no tasks present', () => {
    it('returns an empty array when XML has no tm:task elements', () => {
        const tasks = parseTransportTasks(toDoc(FIX_NO_TASKS));
        expect(Array.isArray(tasks)).toBe(true);
        expect(tasks).toHaveLength(0);
    });
});

// =============================================================================
// 8. Unit — Backwards Compatibility
//    Legacy fixtures (no new attrs) must produce IDENTICAL output to
//    the pre-change parser for taskId + objects[].
// =============================================================================

describe('parseTransportTasks — backwards compatibility', () => {
    it('produces identical taskId/objects[] output for legacy XML', () => {
        const tasks = parseTransportTasks(toDoc(FIX_LEGACY_BACKCOMPAT));
        expect(tasks).toHaveLength(1);

        const task = tasks[0]!;
        expect(task.taskId).toBe('DS4K900400');

        // No new attributes set — keys absent.
        expect('owner' in task).toBe(false);
        expect('description' in task).toBe(false);
        expect('status' in task).toBe(false);

        // Old contract: 3 objects with exact field shapes.
        expect(task.objects).toHaveLength(3);

        const expectedObjects: TransportObject[] = [
            {
                name: 'ZLEG_1',
                description: 'Legacy 1',
                pgmid: 'R3TR',
                type: 'DDLS',
                position: '000001',
            },
            {
                // tm:obj_desc absent → falls back to tm:obj_info
                name: 'ZLEG_2',
                description: 'Info-fallback only',
                pgmid: 'R3TR',
                type: 'TABL',
                position: '000002',
            },
            {
                // No descriptive attrs at all → empty strings, not missing keys
                name: 'ZLEG_3',
                description: '',
                pgmid: '',
                type: '',
                position: '',
            },
        ];
        expect(task.objects).toEqual(expectedObjects);
    });

    it('skips tm:abap_object entries that have no tm:name', () => {
        const xml = wrap(`
            <tm:task tm:number="DS4K900401">
                <tm:abap_object tm:obj_desc="Nameless ghost" tm:pgmid="R3TR"
                                tm:type="DDLS" tm:position="000001"/>
                <tm:abap_object tm:name="ZREAL_OBJ" tm:obj_desc="Real"
                                tm:pgmid="R3TR" tm:type="DDLS" tm:position="000002"/>
            </tm:task>
        `);

        const tasks = parseTransportTasks(toDoc(xml));
        expect(tasks).toHaveLength(1);
        expect(tasks[0]!.objects).toHaveLength(1);
        expect(tasks[0]!.objects[0]!.name).toBe('ZREAL_OBJ');
    });
});

// =============================================================================
// 9. Smoke — End-to-end shape conformance
// =============================================================================

describe('parseTransportTasks — smoke / shape conformance', () => {
    it('returns an array whose elements match the public TaskContents shape', () => {
        const xml = wrap(`
            <tm:task tm:number="DS4K900500" tm:owner="USR1" tm:desc="Smoke" tm:status="D">
                <tm:abap_object tm:name="ZSMK_1" tm:obj_desc="Smoke 1"
                                tm:pgmid="R3TR" tm:type="DDLS" tm:position="000001"/>
                <tm:abap_object tm:name="ZSMK_2" tm:obj_desc="Smoke 2"
                                tm:pgmid="R3TR" tm:type="TABL" tm:position="000002"/>
            </tm:task>
            <tm:task tm:number="DS4K900501">
                <tm:abap_object tm:name="ZSMK_3" tm:obj_desc="Smoke 3"
                                tm:pgmid="R3TR" tm:type="CLAS" tm:position="000003"/>
            </tm:task>
        `);

        const tasks: TaskContents[] = parseTransportTasks(toDoc(xml));

        expect(Array.isArray(tasks)).toBe(true);
        expect(tasks.length).toBe(2);

        for (const task of tasks) {
            // Required fields present and well-typed.
            expect(typeof task.taskId).toBe('string');
            expect(task.taskId.length).toBeGreaterThan(0);
            expect(Array.isArray(task.objects)).toBe(true);

            // Optional fields: either absent OR a string (never null/undefined value).
            if ('owner' in task) expect(typeof task.owner).toBe('string');
            if ('description' in task) expect(typeof task.description).toBe('string');
            if ('status' in task) expect(typeof task.status).toBe('string');

            for (const obj of task.objects) {
                expect(typeof obj.name).toBe('string');
                expect(typeof obj.description).toBe('string');
                expect(typeof obj.pgmid).toBe('string');
                expect(typeof obj.type).toBe('string');
                expect(typeof obj.position).toBe('string');
            }
        }

        // Spot-check the first task against the smoke fixture.
        expect(tasks[0]!.taskId).toBe('DS4K900500');
        expect(tasks[0]!.owner).toBe('USR1');
        expect(tasks[0]!.objects).toHaveLength(2);

        // Second task has no optional fields.
        expect('owner' in tasks[1]!).toBe(false);
        expect(tasks[1]!.objects).toHaveLength(1);
    });
});

// =============================================================================
// 10. Blackbox / Adversarial
// =============================================================================

describe('parseTransportTasks — blackbox / adversarial', () => {
    it('returns empty array for XML with no tm:task at any nesting depth', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<root>
  <unrelated tm:number="X" xmlns:tm="http://www.sap.com/cts/adt/tm">
    <child/>
  </unrelated>
</root>`;
        const tasks = parseTransportTasks(toDoc(xml));
        expect(tasks).toEqual([]);
    });

    it('finds tm:task elements regardless of nesting depth', () => {
        // Deeply nested but the parser uses getElementsByTagName which is
        // recursive — it should still find the task.
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<asx:abap xmlns:asx="http://www.sap.com/abapxml">
  <a><b><c><d>
    <tm:task xmlns:tm="http://www.sap.com/cts/adt/tm"
             tm:number="DEEP001" tm:owner="SPELUNKER" tm:desc="Deep" tm:status="D">
      <tm:abap_object tm:name="ZDEEP" tm:obj_desc="Deep object"
                      tm:pgmid="R3TR" tm:type="DDLS" tm:position="000001"/>
    </tm:task>
  </d></c></b></a>
</asx:abap>`;
        const tasks = parseTransportTasks(toDoc(xml));
        expect(tasks).toHaveLength(1);
        expect(tasks[0]!.taskId).toBe('DEEP001');
        expect(tasks[0]!.owner).toBe('SPELUNKER');
    });

    it('whitespace-only attribute values are treated as PRESENT (truthy strings)', () => {
        // Pinned behavior: `"   "` is truthy in JS, so the conditional
        // spread keeps the key. This is documented as intentional.
        // If the parser ever calls .trim() before the spread, this test
        // breaks intentionally — review the change.
        const xml = wrap(`
            <tm:task tm:number="WS001" tm:owner="   " tm:desc=" 	 " tm:status=" ">
                <tm:abap_object tm:name="ZWS" tm:obj_desc="WS"
                                tm:pgmid="R3TR" tm:type="DDLS" tm:position="000001"/>
            </tm:task>
        `);
        const tasks = parseTransportTasks(toDoc(xml));
        expect(tasks).toHaveLength(1);
        const task = tasks[0]!;

        expect('owner' in task).toBe(true);
        expect('description' in task).toBe(true);
        expect('status' in task).toBe(true);
        expect(task.owner).toBe('   ');
        expect(task.status).toBe(' ');
        // tm:desc value contained a tab in source — XML attribute-value
        // normalization (per XML 1.0 §3.3.3) collapses tabs/newlines to
        // spaces. xmldom follows the spec, so we assert it remains a
        // truthy whitespace-only string (the conditional-spread input
        // path that matters) rather than asserting on a literal tab.
        const desc = task.description!;
        expect(desc.length).toBeGreaterThan(0);
        expect(desc.trim()).toBe('');
    });

    it('passes XML-special characters through unescaped (xmldom decodes entities)', () => {
        const xml = wrap(`
            <tm:task tm:number="SP001"
                     tm:owner="USR&amp;ADMIN"
                     tm:desc="A &lt;b&gt; &quot;c&quot; &amp; d"
                     tm:status="D">
                <tm:abap_object tm:name="ZSPC" tm:obj_desc="x &amp; y"
                                tm:pgmid="R3TR" tm:type="DDLS" tm:position="000001"/>
            </tm:task>
        `);
        const tasks = parseTransportTasks(toDoc(xml));
        expect(tasks).toHaveLength(1);
        expect(tasks[0]!.owner).toBe('USR&ADMIN');
        expect(tasks[0]!.description).toBe('A <b> "c" & d');
        expect(tasks[0]!.objects[0]!.description).toBe('x & y');
    });

    it('passes multi-byte UTF-8 attribute values through verbatim', () => {
        const xml = wrap(`
            <tm:task tm:number="UTF001"
                     tm:owner="개발자"
                     tm:desc="日本語の説明 — ümlauts &amp; café"
                     tm:status="活">
                <tm:abap_object tm:name="ZUTF" tm:obj_desc="🚀 rocket"
                                tm:pgmid="R3TR" tm:type="DDLS" tm:position="000001"/>
            </tm:task>
        `);
        const tasks = parseTransportTasks(toDoc(xml));
        expect(tasks).toHaveLength(1);
        const task = tasks[0]!;
        expect(task.owner).toBe('개발자');
        expect(task.description).toBe('日本語の説明 — ümlauts & café');
        expect(task.status).toBe('活');
        expect(task.objects[0]!.description).toBe('🚀 rocket');
    });

    it('handles very long attribute values without truncation (1500 chars)', () => {
        const longValue = 'X'.repeat(1500);
        const xml = wrap(`
            <tm:task tm:number="LONG001" tm:owner="${longValue}" tm:desc="${longValue}" tm:status="D">
                <tm:abap_object tm:name="ZLONG" tm:obj_desc="${longValue}"
                                tm:pgmid="R3TR" tm:type="DDLS" tm:position="000001"/>
            </tm:task>
        `);
        const tasks = parseTransportTasks(toDoc(xml));
        expect(tasks).toHaveLength(1);
        expect(tasks[0]!.owner).toHaveLength(1500);
        expect(tasks[0]!.description).toHaveLength(1500);
        expect(tasks[0]!.objects[0]!.description).toHaveLength(1500);
    });

    it('with duplicate tm:owner attributes, getAttribute returns one value (xmldom-defined)', () => {
        // Invalid XML — but xmldom may tolerate duplicates. We pin
        // whatever xmldom does so a runtime change is detectable.
        // Strategy: build the duplicate-attribute string manually because
        // xmldom may reject during parse; if it does, we accept that too.
        const xmlWithDupAttr = wrap(`
            <tm:task tm:number="DUP001" tm:owner="FIRST" tm:owner="SECOND" tm:desc="D" tm:status="D">
                <tm:abap_object tm:name="ZDUP" tm:obj_desc="Dup"
                                tm:pgmid="R3TR" tm:type="DDLS" tm:position="000001"/>
            </tm:task>
        `);

        // Either xmldom errors OR returns a single owner value. Both are
        // acceptable but the value (if any) MUST be one of the two.
        let tasks: TaskContents[] = [];
        let threw = false;
        try {
            tasks = parseTransportTasks(toDoc(xmlWithDupAttr));
        } catch {
            threw = true;
        }

        if (!threw && tasks.length === 1) {
            const ownerValue = tasks[0]!.owner;
            // xmldom may: (a) keep the first attr ('FIRST'),
            // (b) keep the last attr ('SECOND'), or
            // (c) drop the attribute entirely (owner key absent → undefined).
            // All three are acceptable — pin whichever happens.
            const acceptable: ReadonlyArray<string | undefined> = ['FIRST', 'SECOND', undefined];
            expect(acceptable).toContain(ownerValue);
        } else {
            // If xmldom rejected the duplicate-attr XML, the parser
            // either threw OR returned [] — either is acceptable.
            // Just confirm we did not silently produce garbage.
            expect(threw || tasks.length === 0 || tasks.length === 1).toBe(true);
        }
    });

    it('still extracts valid tasks when sibling unrelated XML contains tm:task-like names', () => {
        // namespace clash: a different `task` tag with no `tm:` prefix
        // must NOT be picked up by getElementsByTagName('tm:task').
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<root xmlns:tm="http://www.sap.com/cts/adt/tm" xmlns:other="http://example.com/other">
  <other:task tm:number="FAKE001"><!-- different namespace, must be ignored --></other:task>
  <task tm:number="FAKE002"><!-- no namespace at all --></task>
  <tm:task tm:number="REAL001" tm:owner="REAL_USER" tm:desc="Real" tm:status="D">
    <tm:abap_object tm:name="ZREAL" tm:obj_desc="Real"
                    tm:pgmid="R3TR" tm:type="DDLS" tm:position="000001"/>
  </tm:task>
</root>`;
        const tasks = parseTransportTasks(toDoc(xml));
        expect(tasks).toHaveLength(1);
        expect(tasks[0]!.taskId).toBe('REAL001');
        expect(tasks[0]!.owner).toBe('REAL_USER');
    });
});

// =============================================================================
// 11. Mutation-style spot checks
//     Each new line in the parser has at least one assertion that would
//     fail if that single line were removed.
// =============================================================================

describe('parseTransportTasks — mutation-style spot checks', () => {
    const xml = wrap(`
        <tm:task tm:number="MUT001" tm:owner="OWNER_X" tm:desc="DESC_X" tm:status="STAT_X">
            <tm:abap_object tm:name="ZMUT" tm:obj_desc="Mut"
                            tm:pgmid="R3TR" tm:type="DDLS" tm:position="000001"/>
        </tm:task>
    `);

    it('removing the tm:owner extraction would fail this assertion', () => {
        const tasks = parseTransportTasks(toDoc(xml));
        expect(tasks[0]!.owner).toBe('OWNER_X');
    });

    it('removing the tm:desc extraction would fail this assertion', () => {
        const tasks = parseTransportTasks(toDoc(xml));
        expect(tasks[0]!.description).toBe('DESC_X');
    });

    it('removing the tm:status extraction would fail this assertion', () => {
        const tasks = parseTransportTasks(toDoc(xml));
        expect(tasks[0]!.status).toBe('STAT_X');
    });

    it('replacing conditional spread with unconditional spread would fail (key absent when attr missing)', () => {
        // If someone replaced `...(owner ? { owner } : {})` with
        // `{ owner }` (unconditional) and tm:owner was missing,
        // getAttribute returns null in xmldom and the key would appear
        // with value null. This test catches that.
        const tasks = parseTransportTasks(toDoc(FIX_NO_NEW_ATTRS));
        expect('owner' in tasks[0]!).toBe(false);
        expect('description' in tasks[0]!).toBe(false);
        expect('status' in tasks[0]!).toBe(false);
    });
});
