/**
 * Integration Test: DDIC Workflow (data elements, domains, conversion routines)
 *
 * One upsert creates a conversion routine (function group + 2 function modules),
 * a domain using it, and data elements typed both ways; then activate → read back
 * → re-upsert (unchanged) → update → check → diff → delete.
 *
 * Run with: bun test src/__tests__/integration/ddic-workflow.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { TEST_CONFIG, createTestClient, shouldSkip, safeLogout } from './test-helpers';
import type { ADTClient } from '../../core';
import type { ObjectContent, ObjectRef } from '../../types/requests';
import { getFormHandler } from '../../core/ddic';

type RawRequest = (options: object) => Promise<[Response | null, Error | null]>;

// Conversion routines are at most 5 characters; the folder = group rule names the group after it.
const STAMP = Date.now().toString(36).toUpperCase().slice(-4);
const ROUTINE = `Z${STAMP}`;
const DOMAIN = `ZCD_${STAMP}`;
const DTEL_DOMAIN = `ZCE_${STAMP}_D`;
const DTEL_PREDEFINED = `ZCE_${STAMP}_P`;
const FM_INPUT = `CONVERSION_EXIT_${ROUTINE}_INPUT`;
const FM_OUTPUT = `CONVERSION_EXIT_${ROUTINE}_OUTPUT`;

function functionModule(name: string): string {
    return `FUNCTION ${name.toLowerCase()}
  IMPORTING
    VALUE(input) TYPE any ##ADT_PARAMETER_UNTYPED
  EXPORTING
    VALUE(output) TYPE any ##ADT_PARAMETER_UNTYPED.

  output = input.
ENDFUNCTION.`;
}

const DOMAIN_SOURCE = `@EndUserText.label: 'Catalyst test domain'
define domain ${DOMAIN.toLowerCase()} {
\tdata type : abap.char (2);
\tconversion routine : ${ROUTINE};
\tfixed values {
\t\t'A' : 'Actual';
\t\t'P' : 'Plan';
\t}
}`;

function dataElementSource(name: string, typeClause: string, shortLabel: string): string {
    return `@EndUserText.label: 'Catalyst test element'
define data element ${name.toLowerCase()} {
\t${typeClause}
\tlabels {
\t\tshort   : '${shortLabel}';
\t\tmedium  : 'Test medium';
\t\tlong    : 'Catalyst test element';
\t\theading : 'Test heading';
\t}
}`;
}

const OBJECTS: ObjectContent[] = [
    { name: DTEL_DOMAIN, extension: 'asdtel', content: dataElementSource(DTEL_DOMAIN, `domain : ${DOMAIN.toLowerCase()};`, 'Test') },
    { name: DTEL_PREDEFINED, extension: 'asdtel', content: dataElementSource(DTEL_PREDEFINED, 'data type : abap.dec(13,2);', 'Test') },
    { name: DOMAIN, extension: 'asdoma', content: DOMAIN_SOURCE },
    { name: FM_INPUT, extension: 'asfunc', container: ROUTINE, content: functionModule(FM_INPUT), description: 'Conversion exit input' },
    { name: FM_OUTPUT, extension: 'asfunc', container: ROUTINE, content: functionModule(FM_OUTPUT), description: 'Conversion exit output' },
];

function refs(objects: ObjectContent[]): ObjectRef[] {
    return objects.map(({ name, extension, container }) => (container ? { name, extension, container } : { name, extension }));
}

describe('DDIC Workflow', () => {
    let client: ADTClient | null = null;
    let created = false;

    beforeAll(async () => {
        const [newClient, err] = await createTestClient();
        if (err) throw err;
        client = newClient;
    });

    afterAll(async () => {
        if (created && client?.session) {
            // Referencers first: data elements, domain, function modules, then the empty group.
            for (const group of [OBJECTS.slice(0, 2), OBJECTS.slice(2, 3), OBJECTS.slice(3)]) {
                const [, deleteErr] = await client.delete(refs(group), TEST_CONFIG.transport);
                if (deleteErr) console.warn(`Cleanup failed: ${deleteErr.message}`);
            }
            await deleteFunctionGroup(client, ROUTINE);
        }
        await safeLogout(client);
    });

    it('creates everything in one upsert, groups and modules first', async () => {
        if (shouldSkip(client)) return;

        const [results, error] = await client!.upsert(OBJECTS, TEST_CONFIG.package, TEST_CONFIG.transport);
        expect(error).toBeNull();
        created = true;

        expect(results!.map(r => `${r.name}.${r.extension}:${r.status}`)).toEqual([
            `${ROUTINE}.fugr:created`,
            `${FM_INPUT}.asfunc:created`,
            `${FM_OUTPUT}.asfunc:created`,
            `${DOMAIN}.asdoma:created`,
            `${DTEL_DOMAIN}.asdtel:created`,
            `${DTEL_PREDEFINED}.asdtel:created`,
        ]);
    });

    it('activates the batch without errors', async () => {
        if (shouldSkip(client)) return;

        const [results, error] = await client!.activate(refs(OBJECTS));
        expect(error).toBeNull();
        const errors = results!.flatMap(r => r.messages.filter(m => m.severity === 'error').map(m => `${r.name}: ${m.text}`));
        expect(errors).toEqual([]);
    });

    it('reads form objects back as equivalent DSL', async () => {
        if (shouldSkip(client)) return;

        for (const object of OBJECTS.slice(0, 3)) {
            const [read, error] = await client!.read([{ name: object.name, extension: object.extension }]);
            expect(error).toBeNull();
            const [same, compareErr] = getFormHandler(object.extension)!.equivalent(object.content, read![0]!.content);
            expect(compareErr).toBeNull();
            expect(same).toBe(true);
        }
    });

    it('finds a function module by name alone', async () => {
        if (shouldSkip(client)) return;

        const [read, error] = await client!.read([{ name: FM_INPUT, extension: 'asfunc' }]);
        expect(error).toBeNull();
        expect(read![0]!.container).toBe(ROUTINE);
        expect(read![0]!.content.toLowerCase()).toContain(`function ${FM_INPUT.toLowerCase()}`);
    });

    it('reports a second upsert as unchanged', async () => {
        if (shouldSkip(client)) return;

        const [results, error] = await client!.upsert(OBJECTS, TEST_CONFIG.package, TEST_CONFIG.transport);
        expect(error).toBeNull();
        expect(results!.every(r => r.status === 'unchanged')).toBe(true);
    });

    it('updates a changed label and reads it back', async () => {
        if (shouldSkip(client)) return;

        const changed = { ...OBJECTS[1]!, content: dataElementSource(DTEL_PREDEFINED, 'data type : abap.dec(13,2);', 'Changed') };
        const [results, error] = await client!.upsert([changed], TEST_CONFIG.package, TEST_CONFIG.transport);
        expect(error).toBeNull();
        expect(results![0]!.status).toBe('updated');

        const [read] = await client!.read([{ name: DTEL_PREDEFINED, extension: 'asdtel' }]);
        expect(read![0]!.content).toContain("short   : 'Changed';");
    });

    it('checks a form object', async () => {
        if (shouldSkip(client)) return;

        const [results, error] = await client!.checkSyntax([{ name: DOMAIN, extension: 'asdoma' }]);
        expect(error).toBeNull();
        expect(results![0]!.status).not.toBe('error');
    });

    it('diffs without formatting noise', async () => {
        if (shouldSkip(client)) return;

        const [results, error] = await client!.gitDiff([OBJECTS[2]!]);
        expect(error).toBeNull();
        // Local omits output length; the server's derived value is the only difference.
        const changed = results![0]!.diffs.flatMap(d => (d.type === 'modification' ? d.changes.flat() : d.changes));
        expect(changed.every(line => line.includes('output length'))).toBe(true);
    });
});

// Function groups aren't a configured type; remove the test group with a raw lock + DELETE.
async function deleteFunctionGroup(client: ADTClient, name: string): Promise<void> {
    const request = (client as unknown as { request: RawRequest }).request.bind(client);
    const path = `/sap/bc/adt/functions/groups/${name.toLowerCase()}`;
    const [lockRes] = await request({
        method: 'POST',
        path,
        params: { _action: 'LOCK', accessMode: 'MODIFY' },
        headers: { Accept: 'application/*,application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result' },
    });
    const handle = /<LOCK_HANDLE>([^<]+)</.exec((await lockRes?.text()) ?? '')?.[1];
    if (!handle) {
        console.warn(`Cleanup: could not lock function group ${name}`);
        return;
    }
    const params: Record<string, string> = { lockHandle: handle };
    if (TEST_CONFIG.transport) params['corrNr'] = TEST_CONFIG.transport;
    const [deleteRes] = await request({ method: 'DELETE', path, params });
    if (!deleteRes?.ok) console.warn(`Cleanup: failed to delete function group ${name} (HTTP ${deleteRes?.status})`);
}
