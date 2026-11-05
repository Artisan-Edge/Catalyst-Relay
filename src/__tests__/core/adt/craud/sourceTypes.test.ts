/**
 * Unit Tests for lock object deletes, number range objects and diff line endings
 *
 * - Deleting a lock object with its table is not blocked by the generated ENQUEUE_/DEQUEUE_ modules
 * - A number range object is created as blue:blueSource with header.description from its JSON
 *   and read/written as application/json
 * - CRLF from SAP and a trailing newline are not diffs
 * - gitDiff agrees with upsert: no hunks where it would report unchanged (table re-layout, trailing
 *   blanks, a function module signature's layout); indentation and CDS view formatting are hunks
 */

import { describe, it, expect } from 'bun:test';
import { multiDeleteObjects } from '../../../../core/adt/craud/multiDelete';
import { createObject } from '../../../../core/adt/craud/create';
import { readObject } from '../../../../core/adt/craud/read';
import { updateObject } from '../../../../core/adt/craud/update';
import { gitDiff } from '../../../../core/adt/craud/gitDiff';
import type { AdtRequestor } from '../../../../core/adt';

interface Call {
    method: string;
    path: string;
    uri?: string;
    headers?: Record<string, string>;
    body?: string;
}

function recorder(respond: (call: Call) => Response): { requestor: AdtRequestor; calls: Call[] } {
    const calls: Call[] = [];
    const requestor: AdtRequestor = {
        request: async (options) => {
            const call: Call = { method: options.method, path: options.path };
            if (options.params?.['uri']) call.uri = String(options.params['uri']);
            if (options.headers) call.headers = options.headers;
            if (options.body !== undefined) call.body = options.body;
            calls.push(call);
            return [respond(call), null];
        },
    };
    return { requestor, calls };
}

function usages(refs: { uri: string; name: string; type: string }[]): string {
    const items = refs.map(r => `<usageReferences:referencedObject uri="${r.uri}" isResult="true"><usageReferences:adtObject adtcore:name="${r.name}" adtcore:type="${r.type}"><adtcore:packageRef adtcore:name="$TMP"/></usageReferences:adtObject></usageReferences:referencedObject>`).join('');
    return `<?xml version="1.0" encoding="utf-8"?><usageReferences:usageReferenceResult xmlns:usageReferences="http://www.sap.com/adt/ris/usageReferences" xmlns:adtcore="http://www.sap.com/adt/core"><usageReferences:referencedObjects>${items}</usageReferences:referencedObjects></usageReferences:usageReferenceResult>`;
}

describe('deleting a lock object with its table', () => {
    it('treats the generated lock modules as the lock object and deletes it first', async () => {
        const tableUsages = usages([
            { uri: '/sap/bc/adt/functions/groups/%2f1bcdwben%2ften0000', name: '/1BCDWBEN/TEN0000', type: 'FUGR/F' },
            { uri: '/sap/bc/adt/functions/groups/%2f1bcdwben%2ften0000/fmodules/enqueue_ezlk', name: 'ENQUEUE_EZLK', type: 'FUGR/FF' },
        ]);
        const { requestor, calls } = recorder(call => {
            if (call.path.includes('usageReferences')) {
                return new Response(call.uri?.includes('ddic/tables/ztab') ? tableUsages : usages([]), { status: 200 });
            }
            if (call.method === 'POST') return new Response('<LOCK_HANDLE>H</LOCK_HANDLE>', { status: 200 });
            return new Response('', { status: 200 });
        });

        const [results, error] = await multiDeleteObjects(requestor, [{ name: 'ZTAB', extension: 'astabldt' }, { name: 'EZLK', extension: 'asenqu' }], undefined);

        expect(error).toBeNull();
        expect(results!.every(r => r.status === 'success')).toBe(true);
        const deletes = calls.filter(c => c.method === 'DELETE').map(c => c.path);
        expect(deletes).toEqual(['/sap/bc/adt/ddic/lockobjects/sources/ezlk', '/sap/bc/adt/ddic/tables/ztab/source/main']);
    });
});

const NROB_JSON = JSON.stringify({ formatVersion: '1', header: { description: 'C2T Intervals', originalLanguage: 'en' }, interval: { numberLengthDomain: 'NUM10', percentWarning: 10.0, subType: '', untilYear: false, rolling: true, prefix: false }, configuration: { buffering: 'none', bufferedNumbers: 10 } }, null, 2);

describe('number range objects', () => {
    it('creates a blueSource with the JSON header description', async () => {
        const { requestor, calls } = recorder(() => new Response('', { status: 201 }));
        const [, error] = await createObject(requestor, { name: 'ZNRO', extension: 'asnrob', content: NROB_JSON }, '$TMP', undefined, 'me');

        expect(error).toBeNull();
        expect(calls[0]!.path).toBe('/sap/bc/adt/numberranges/objects');
        expect(calls[0]!.headers!['Content-Type']).toBe('application/vnd.sap.adt.blues.v1+xml');
        expect(calls[0]!.body).toContain('<blue:blueSource');
        expect(calls[0]!.body).toContain('adtcore:description="C2T Intervals"');
        expect(calls[0]!.body).toContain('adtcore:type="NROB/NRO"');
    });

    it('reads and writes /source/main as JSON', async () => {
        const { requestor, calls } = recorder(() => new Response(NROB_JSON, { status: 200 }));
        await readObject(requestor, { name: 'ZNRO', extension: 'asnrob' });
        await updateObject(requestor, { name: 'ZNRO', extension: 'asnrob', content: NROB_JSON }, 'H', undefined);

        expect(calls[0]!.headers!['Accept']).toBe('application/json');
        expect(calls[1]!.path).toBe('/sap/bc/adt/numberranges/objects/znro/source/main');
        expect(calls[1]!.headers!['Content-Type']).toBe('application/json');
    });
});

describe('gitDiff line endings', () => {
    it('reports no diff for CRLF server text and a trailing local newline', async () => {
        const { requestor } = recorder(() => new Response('REPORT zfoo.\r\nWRITE 1.', { status: 200 }));
        const [result, error] = await gitDiff(requestor, { name: 'ZFOO', extension: 'asprog', content: 'REPORT zfoo.\nWRITE 1.\n' });

        expect(error).toBeNull();
        expect(result!.diffs).toEqual([]);
    });
});

describe('gitDiff agrees with upsert', () => {
    const SAP_TABLE = "@EndUserText.label : 'Map'\r\ndefine table zmap {\r\n\r\n  key mandt : mandt not null;\r\n  name      : abap.char( 30 );\r\n\r\n}";
    const LOCAL_TABLE = "@EndUserText.label: 'Map'\ndefine table zmap {\n\tkey mandt: mandt not null;\n\tname: abap.char(30);\n}\n";

    it('reports no diff for a CDS table SAP only re-laid out', async () => {
        const { requestor } = recorder(() => new Response(SAP_TABLE, { status: 200 }));
        const [result, error] = await gitDiff(requestor, { name: 'ZMAP', extension: 'astabldt', content: LOCAL_TABLE });

        expect(error).toBeNull();
        expect(result!.diffs).toEqual([]);
    });

    it('reports the full line diff for a real change', async () => {
        const { requestor } = recorder(() => new Response(SAP_TABLE, { status: 200 }));
        const [result, error] = await gitDiff(requestor, { name: 'ZMAP', extension: 'astabldt', content: LOCAL_TABLE.replace('char(30)', 'char(40)') });

        expect(error).toBeNull();
        expect(result!.diffs.length).toBeGreaterThan(0);
        expect(result!.diffs.flatMap(hunk => hunk.changes.flat()).some(line => line.includes('char(40)'))).toBe(true);
    });

    it('reports an ABAP indentation change', async () => {
        const { requestor } = recorder(() => new Response('REPORT zfoo.\r\nWRITE 1.', { status: 200 }));
        const [result, error] = await gitDiff(requestor, { name: 'ZFOO', extension: 'asprog', content: 'REPORT zfoo.\n  WRITE 1.\n' });

        expect(error).toBeNull();
        expect(result!.diffs).toHaveLength(1);
    });

    it('ignores in ABAP what upsert ignores: trailing blanks, indented blank lines, a trailing blank line, a bare CR', async () => {
        const { requestor } = recorder(() => new Response('REPORT zfoo.\r\n\r\nWRITE 1.', { status: 200 }));
        const [result, error] = await gitDiff(requestor, { name: 'ZFOO', extension: 'asprog', content: 'REPORT zfoo.  \r    \nWRITE 1.\t\n   \n' });

        expect(error).toBeNull();
        expect(result!.diffs).toEqual([]);
    });

    it("reports no diff for ADT's layout of a function module signature", async () => {
        const sap = 'FUNCTION z_hello\r\n  IMPORTING\r\n    VALUE(name) TYPE string.\r\n\r\n  WRITE name.\r\nENDFUNCTION.';
        const { requestor } = recorder(() => new Response(sap, { status: 200 }));
        const fm = { name: 'Z_HELLO', extension: 'asfunc', container: 'ZGRP' };
        const [same] = await gitDiff(requestor, { ...fm, content: 'FUNCTION z_hello IMPORTING VALUE(name) TYPE string.\n\n  WRITE name.\nENDFUNCTION.\n' });
        const [changed] = await gitDiff(requestor, { ...fm, content: 'FUNCTION z_hello IMPORTING VALUE(name) TYPE string.\n\nWRITE name.\nENDFUNCTION.\n' });

        expect(same!.diffs).toEqual([]);
        expect(changed!.diffs.length).toBeGreaterThan(0);
    });

    it('reports no diff for the blank lines SAP stores after a function module signature', async () => {
        const remote = 'FUNCTION z_x\r\n  EXPORTING\r\n    VALUE(result) TYPE string.\r\n\r\n\r\n\r\n  PERFORM increment.\r\n  result = |Hello { gv_counter }|.\r\nENDFUNCTION.';
        const local = 'FUNCTION z_x\n  EXPORTING\n    VALUE(result) TYPE string.\n\n  PERFORM increment.\n  result = |Hello { gv_counter }|.\nENDFUNCTION.';
        const { requestor } = recorder(() => new Response(remote, { status: 200 }));
        const [result, error] = await gitDiff(requestor, { name: 'Z_X', extension: 'asfunc', container: 'ZGRP', content: local });

        expect(error).toBeNull();
        expect(result!.diffs).toEqual([]);
    });

    it('reports a formatting-only change to a CDS view', async () => {
        const { requestor } = recorder(() => new Response("@EndUserText.label: 'V'\r\ndefine view entity zv as select from t000 {\r\n  key mandt\r\n}", { status: 200 }));
        const [result] = await gitDiff(requestor, { name: 'ZV', extension: 'asddls', content: "@EndUserText.label : 'V'\ndefine view entity zv as select from t000 {\n  key mandt\n}" });

        expect(result!.diffs).toHaveLength(1);
    });

    it('passes the read error through', async () => {
        const { requestor } = recorder(() => new Response('Forbidden', { status: 403 }));
        const [, error] = await gitDiff(requestor, { name: 'ZFOO', extension: 'asprog', content: 'REPORT zfoo.' });

        expect(error!.message).not.toContain('does not exist on server');
    });
});
