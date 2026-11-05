/**
 * Unit Tests for text elements: the ADT text format (parse / serialize / canonical / validate) and
 * the write flow (lock → PUT per part → unlock) against a mock requestor.
 *
 * Fixtures are real GET responses (CRLF) captured from an S/4HANA system (SAP_BASIS 758).
 */

import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import {
    parseTextElements,
    serializeTextElements,
    canonicalTextElements,
    textElementsEquivalent,
    validateTextElements,
    writeTextElements,
    readTextElements,
    resolveTextElementsOwner,
    textElementsReference,
    activateTextElements,
} from '../../../../core/adt';
import { parseTextActivation } from '../../../../core/adt/textelements/activateTextElements';
import type { AdtRequestor, TextElementEntry } from '../../../../core/adt';

const FIXTURES = path.join(import.meta.dir, '../../../fixtures/textelements');
const LOCK_XML = '<?xml version="1.0"?><asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><LOCK_HANDLE>H123</LOCK_HANDLE></DATA></asx:values></asx:abap>';

function fixture(name: string): string {
    return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

function entries(part: Parameters<typeof parseTextElements>[0], text: string): TextElementEntry[] {
    const [parsed, error] = parseTextElements(part, text);
    if (error) throw error;
    return parsed;
}

interface Call {
    method: string;
    path: string;
    params: Record<string, string | number> | undefined;
    headers: Record<string, string> | undefined;
    body: string | undefined;
}

function recordingRequestor(respond: (call: Call) => Response = () => new Response('', { status: 200 })): { requestor: AdtRequestor; calls: Call[] } {
    const calls: Call[] = [];
    const requestor: AdtRequestor = {
        request: async (options) => {
            const call = { method: options.method, path: options.path, params: options.params, headers: options.headers, body: options.body };
            calls.push(call);
            if (options.params?.['_action'] === 'LOCK') return [new Response(LOCK_XML, { status: 200 }), null];
            return [respond(call), null];
        },
    };
    return { requestor, calls };
}

describe('parseTextElements', () => {
    it('reads every symbol with its @MaxLength', () => {
        const symbols = entries('symbols', fixture('symbols.txt'));
        expect(symbols).toHaveLength(65);
        expect(symbols[0]).toEqual({ key: 'C01', text: 'Continue Past Failed Segment', maxLength: 30 });
        expect(symbols.every(entry => entry.maxLength !== undefined)).toBe(true);
    });

    it('drops untexted selections (?...) and keeps padded names unpadded', () => {
        const selections = entries('selections', fixture('selections.txt'));
        expect(selections).toHaveLength(37);
        expect(selections.find(entry => entry.key === 'P_RUNID')).toBeUndefined();
        expect(selections[0]).toEqual({ key: 'E_CONT', text: 'Continue Past Failed Segment' });
    });

    it('keeps @DDICReference, even with an empty text', () => {
        expect(entries('selections', '@DDICReference\nP_MANDT =\n\nP_ONE   =First')).toEqual([
            { key: 'P_MANDT', text: '', ddicReference: true },
            { key: 'P_ONE', text: 'First' },
        ]);
    });

    it('drops empty headings and normalizes heading key case', () => {
        expect(entries('headings', 'listHeader=My list\r\n\r\ncolumnheader_1=Col A\r\ncolumnHeader_2=\r\n')).toEqual([
            { key: 'listHeader', text: 'My list' },
            { key: 'columnHeader_1', text: 'Col A' },
        ]);
    });

    it('accepts LF files without blank lines and keeps "=" inside the text', () => {
        expect(entries('symbols', '@MaxLength:20\n001=a=b\n@MaxLength:5\na02=x')).toEqual([
            { key: '001', text: 'a=b', maxLength: 20 },
            { key: 'A02', text: 'x', maxLength: 5 },
        ]);
    });

    it('rejects misplaced annotations, unknown headings and lines without "="', () => {
        expect(parseTextElements('selections', '@MaxLength:5\nP_A=x')[1]?.message).toContain('only applies to text symbols');
        expect(parseTextElements('symbols', '@DDICReference\n001=x')[1]?.message).toContain('only applies to selection texts');
        expect(parseTextElements('headings', 'title=x')[1]?.message).toContain('unknown heading');
        expect(parseTextElements('symbols', '@MaxLength:5\njust text')[1]?.message).toContain('Line 2');
        expect(parseTextElements('symbols', '@Foo\n001=x')[1]?.message).toContain('unknown annotation');
    });
});

describe('serializeTextElements', () => {
    it('round-trips the SAP fixtures byte-for-byte (CRLF)', () => {
        const symbols = fixture('symbols.txt');
        expect(serializeTextElements('symbols', entries('symbols', symbols), '\r\n')).toBe(symbols.trimEnd());

        const selections = fixture('selections.txt').replace(/\r\n\r\nP_RUNID =\?\.\.\.$/, '');
        expect(serializeTextElements('selections', entries('selections', selections), '\r\n')).toBe(selections.trimEnd());
    });

    it('pads selection names to 8 and prefixes DDIC references', () => {
        expect(serializeTextElements('selections', [{ key: 'P_A', text: 'x' }, { key: 'P_MANDT', text: '', ddicReference: true }]))
            .toBe('P_A     =x\n\n@DDICReference\nP_MANDT =');
    });

    it('groups column headings under the list header', () => {
        expect(serializeTextElements('headings', [{ key: 'listHeader', text: 'L' }, { key: 'columnHeader_1', text: 'A' }, { key: 'columnHeader_3', text: 'C' }]))
            .toBe('listHeader=L\n\ncolumnHeader_1=A\ncolumnHeader_3=C');
    });
});

describe('canonicalTextElements / textElementsEquivalent', () => {
    it('ignores order, line endings, placeholders and DDIC texts', () => {
        const server = 'P_ONE   =First\r\n\r\n@DDICReference\r\nP_MANDT =Client\r\n\r\nP_NONE  =?...';
        const local = '@DDICReference\nP_MANDT =\nP_ONE =First\n';
        expect(textElementsEquivalent('selections', server, local)).toEqual([true, null]);
        expect(canonicalTextElements('selections', server)[0]).toBe('@DDICReference\nP_MANDT =\n\nP_ONE   =First');
    });

    it('sees a changed @MaxLength as a difference', () => {
        expect(textElementsEquivalent('symbols', '@MaxLength:10\n001=x', '@MaxLength:11\n001=x')).toEqual([false, null]);
    });

    it('keeps headings in their fixed order', () => {
        expect(canonicalTextElements('headings', 'columnHeader_2=B\nlistHeader=L')[0]).toBe('listHeader=L\n\ncolumnHeader_2=B');
    });
});

describe('validateTextElements', () => {
    it('requires @MaxLength and a text that fits', () => {
        expect(validateTextElements('symbols', [{ key: '001', text: 'x' }])[1]?.message).toContain('@MaxLength');
        expect(validateTextElements('symbols', [{ key: '001', text: 'too long', maxLength: 3 }])[1]?.message).toContain('over its @MaxLength of 3');
        expect(validateTextElements('symbols', [{ key: '001', text: 'x', maxLength: 133 }])[1]?.message).toContain('1-132');
        expect(validateTextElements('symbols', [{ key: 'ABCD', text: 'x', maxLength: 5 }])[1]?.message).toContain('1-3');
        expect(validateTextElements('symbols', [{ key: '001', text: 'ok', maxLength: 2 }])).toEqual([undefined, null]);
    });

    it('rejects duplicates and over-long selection names', () => {
        expect(validateTextElements('selections', [{ key: 'P_A', text: 'x' }, { key: 'P_A', text: 'y' }])[1]?.message).toContain('Duplicate');
        expect(validateTextElements('selections', [{ key: 'P_TOOLONG9', text: 'x' }])[1]?.message).toContain('8');
    });
});

describe('writeTextElements', () => {
    it('locks the pool, PUTs each part with its media type, then unlocks', async () => {
        const { requestor, calls } = recordingRequestor();
        const [result, error] = await writeTextElements(requestor, { kind: 'program', name: 'zfoo' }, {
            selections: 'P_A =First\nP_B =?...',
            symbols: '@MaxLength:10\n001=Hello',
        }, 'DEVK900001');

        expect(error).toBeNull();
        expect(result).toEqual({ owner: { kind: 'program', name: 'zfoo' }, parts: ['symbols', 'selections'] });
        expect(calls.map(call => `${call.method} ${call.path}`)).toEqual([
            'POST /sap/bc/adt/textelements/programs/zfoo',
            'PUT /sap/bc/adt/textelements/programs/zfoo/source/symbols',
            'PUT /sap/bc/adt/textelements/programs/zfoo/source/selections',
            'POST /sap/bc/adt/textelements/programs/zfoo',
        ]);

        const put = calls[2]!;
        expect(put.params).toEqual({ lockHandle: 'H123', corrNr: 'DEVK900001' });
        expect(put.headers).toEqual({
            'Content-Type': 'application/vnd.sap.adt.textelements.selections.v1; charset=utf-8',
            'Accept': 'application/vnd.sap.adt.textelements.selections.v1',
        });
        // Placeholder dropped, CRLF on the wire
        expect(put.body).toBe('P_A     =First');
        expect(calls[1]!.body).toBe('@MaxLength:10\r\n001=Hello');
        expect(calls[3]!.params).toEqual({ _action: 'UNLOCK', lockHandle: 'H123' });
    });

    it('sends nothing when a part is invalid', async () => {
        const { requestor, calls } = recordingRequestor();
        const [, error] = await writeTextElements(requestor, { kind: 'program', name: 'ZFOO' }, { symbols: '001=No length' });
        expect(error?.message).toContain('@MaxLength');
        expect(calls).toHaveLength(0);
    });

    it('refuses parts the owner kind does not have', async () => {
        const { requestor, calls } = recordingRequestor();
        const [, error] = await writeTextElements(requestor, { kind: 'class', name: 'ZCL_FOO' }, { selections: 'P_A =x' });
        expect(error?.message).toContain('A class has no selection texts');
        expect(calls).toHaveLength(0);
    });

    it('still unlocks when a PUT fails, and reports the PUT error', async () => {
        const { requestor, calls } = recordingRequestor(call => call.method === 'PUT'
            ? new Response('<exc:exception xmlns:exc="x"><localizedMessage lang="EN">Text too long</localizedMessage></exc:exception>', { status: 406 })
            : new Response('', { status: 200 }));
        const [, error] = await writeTextElements(requestor, { kind: 'functionGroup', name: 'ZFG' }, { headings: 'listHeader=L' });
        expect(error?.message).toContain('Failed to write list headings of function group ZFG');
        expect(calls.at(-1)?.params?.['_action']).toBe('UNLOCK');
        expect(calls[1]!.path).toBe('/sap/bc/adt/textelements/functiongroups/zfg/source/headings');
    });
});

describe('readTextElements', () => {
    it('reads every part of the owner kind by default (classes: symbols only)', async () => {
        const { requestor, calls } = recordingRequestor(call => new Response(`body of ${call.path.split('/').pop()}`, { status: 200 }));
        const [parts, error] = await readTextElements(requestor, { kind: 'class', name: 'ZCL_FOO' });
        expect(error).toBeNull();
        expect(parts).toEqual({ symbols: 'body of symbols' });
        expect(calls[0]!.headers).toEqual({ 'Accept': 'application/vnd.sap.adt.textelements.symbols.v1' });
    });

    it('reports a missing owner', async () => {
        const { requestor } = recordingRequestor(() => new Response('<exc/>', { status: 404 }));
        const [, error] = await readTextElements(requestor, { kind: 'program', name: 'zmissing' }, ['symbols']);
        expect(error?.message).toBe('Text elements of program ZMISSING not found');
    });
});

describe('resolveTextElementsOwner', () => {
    it('falls through program and class to function group', async () => {
        const { requestor, calls } = recordingRequestor(call => new Response('', { status: call.path.includes('/functiongroups/') ? 200 : 404 }));
        expect(await resolveTextElementsOwner(requestor, 'zfg')).toEqual([{ kind: 'functionGroup', name: 'ZFG' }, null]);
        expect(calls).toHaveLength(3);
    });

    it('fails when nothing owns the name', async () => {
        const { requestor } = recordingRequestor(() => new Response('', { status: 404 }));
        expect((await resolveTextElementsOwner(requestor, 'znone'))[1]?.message).toContain('No program, class or function group named ZNONE');
    });
});

describe('activateTextElements', () => {
    const SUCCESS = '<?xml version="1.0" encoding="utf-8"?><chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist"><chkl:properties checkExecuted="true" activationExecuted="true" generationExecuted="true"/></chkl:messages>';

    it('uses the synchronous activation endpoint (the background run leaves text pools inactive)', async () => {
        const { requestor, calls } = recordingRequestor(() => new Response(SUCCESS, { status: 200 }));
        const [results, error] = await activateTextElements(requestor, [{ kind: 'program', name: 'zfoo' }, { kind: 'class', name: 'ZCL_BAR' }]);
        expect(error).toBeNull();
        expect(results?.map(result => `${result.name}:${result.status}`)).toEqual(['ZFOO:success', 'ZCL_BAR:success']);

        expect(calls).toHaveLength(1);
        expect(calls[0]!.path).toBe('/sap/bc/adt/activation');
        expect(calls[0]!.params).toEqual({ method: 'activate', preauditRequested: 'true' });
        expect(calls[0]!.body).toContain('adtcore:uri="/sap/bc/adt/textelements/programs/zfoo" adtcore:type="PROG/PX" adtcore:name="ZFOO"');
        expect(calls[0]!.body).toContain('adtcore:type="CLAS/OCX" adtcore:name="ZCL_BAR"');
    });

    it('attributes error messages; activationExecuted="false" alone means already active', () => {
        const refs = [textElementsReference({ kind: 'program', name: 'ZFOO' }), textElementsReference({ kind: 'program', name: 'ZFOO2' })];
        const xml = '<chkl:messages xmlns:chkl="c"><chkl:properties activationExecuted="false"/><msg objDescr="Text elements ZFOO2" type="E"><shortText><txt>Broken</txt></shortText></msg><msg objDescr="ZFOO" type="W"><shortText><txt>Just a warning</txt></shortText></msg></chkl:messages>';
        const [results] = parseTextActivation(refs, xml);
        expect(results?.[1]).toEqual({ name: 'ZFOO2', extension: 'textelements', status: 'error', messages: [{ severity: 'error', text: 'Broken' }] });
        expect(results?.[0]).toMatchObject({ status: 'success', messages: [{ severity: 'info', text: 'Nothing to activate: the text elements are already active' }] });
    });
});

describe('textElementsReference', () => {
    it('uses the text pool type and URI, not the owner\'s', () => {
        expect(textElementsReference({ kind: 'class', name: 'zcl_foo' })).toEqual({
            uri: '/sap/bc/adt/textelements/classes/zcl_foo',
            type: 'CLAS/OCX',
            name: 'ZCL_FOO',
            extension: 'textelements',
        });
        expect(textElementsReference({ kind: 'program', name: 'ZP' }).type).toBe('PROG/PX');
        expect(textElementsReference({ kind: 'functionGroup', name: 'ZF' }).type).toBe('FUGR/PX');
    });
});
