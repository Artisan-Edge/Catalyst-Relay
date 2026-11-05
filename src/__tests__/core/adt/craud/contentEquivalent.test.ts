/**
 * Unit Tests for content comparison (upsert "unchanged") and AFF JSON sources (.asnrob)
 *
 * - AFF JSON compares as values: key order, 1 vs 1.0, whitespace and a BOM are no change
 * - Non-JSON falls back to normalized text
 * - CDS sources ignore whitespace next to separators; ABAP spacing stays significant
 * - header.description is read past a BOM, and the create POST carries it
 */

import { describe, it, expect } from 'bun:test';
import { contentEquivalent } from '../../../../core/adt/craud/contentEquivalent';
import { affJsonDescription } from '../../../../core/adt/aff';
import { createObject } from '../../../../core/adt/craud/create';
import { updateObject } from '../../../../core/adt/craud/update';
import type { AdtRequestor } from '../../../../core/adt';

const SERVER = '{\n  "formatVersion": "1",\n  "header": { "description": "C2T", "originalLanguage": "en" },\n  "interval": { "percentWarning": 10.0, "rolling": true }\n}';

describe('contentEquivalent (.asnrob)', () => {
    it('ignores key order, number formatting, whitespace and a BOM', () => {
        const local = '﻿{"interval":{"rolling":true,"percentWarning":10},"header":{"originalLanguage":"en","description":"C2T"},"formatVersion":"1"}';
        expect(contentEquivalent('asnrob', local, SERVER)).toEqual([true, null]);
    });

    it('detects a changed value', () => {
        expect(contentEquivalent('asnrob', SERVER.replace('10.0', '11'), SERVER)).toEqual([false, null]);
    });

    it('falls back to normalized text when a side is not JSON', () => {
        expect(contentEquivalent('asnrob', 'not json', ' not   json ')).toEqual([true, null]);
        expect(contentEquivalent('asnrob', 'not json', SERVER)).toEqual([false, null]);
    });
});

describe('contentEquivalent (other types)', () => {
    it('compares ABAP source as normalized text, BOM ignored', () => {
        expect(contentEquivalent('asprog', '﻿REPORT z.\n', 'REPORT z.\r\n')).toEqual([true, null]);
    });

    it('ignores SAP pretty-printing of CDS sources', () => {
        const local = "@EndUserText.label: 'Map'\ndefine table zmap {\n\tkey mandt: mandt not null;\n}";
        const sap = "@EndUserText.label : 'Map'\r\ndefine table zmap {\r\n\r\n  key mandt : mandt not null;\r\n\r\n}";
        for (const extension of ['astabldt', 'astablds', 'asddls', 'asdcls', 'asbdef', 'srvd']) {
            expect(contentEquivalent(extension, local, sap)).toEqual([true, null]);
        }
        expect(contentEquivalent('astabldt', local, sap.replace("'Map'", "'Map '"))).toEqual([false, null]);
    });

    it('keeps spacing significant in ABAP sources', () => {
        for (const extension of ['asprog', 'asinc', 'aclass', 'asfunc', 'asfugr', 'asfinc']) {
            expect(contentEquivalent(extension, 'x = a-b.', 'x = a - b.')).toEqual([false, null]);
            expect(contentEquivalent(extension, 'foo( x ).', 'foo(x).')).toEqual([false, null]);
        }
    });

    it('compares form objects semantically', () => {
        const source = '{ "description": "D", "messages": [ { "number": 1, "text": "A" } ] }';
        expect(contentEquivalent('asmsag', `﻿${source}`, '{"messages":[{"number":"001","text":"A","selfExplanatory":true}],"description":"D"}')).toEqual([true, null]);
    });

    it('rejects an unknown extension', () => {
        expect(contentEquivalent('xyz', '', '')[1]?.message).toContain('Unsupported extension');
    });
});

describe('AFF JSON with a BOM', () => {
    it('reads header.description', () => {
        expect(affJsonDescription(`﻿${SERVER}`)).toBe('C2T');
        expect(affJsonDescription('[]')).toBe('');
    });

    it('creates with the description and writes without the BOM', async () => {
        const calls: { body?: string; headers?: Record<string, string> }[] = [];
        const requestor: AdtRequestor = {
            request: async (options) => {
                const call: { body?: string; headers?: Record<string, string> } = {};
                if (options.body !== undefined) call.body = options.body;
                if (options.headers) call.headers = options.headers;
                calls.push(call);
                return [new Response('', { status: 200 }), null];
            },
        };
        await createObject(requestor, { name: 'ZNRO', extension: 'asnrob', content: `﻿${SERVER}` }, '$TMP', undefined, 'me');
        await updateObject(requestor, { name: 'ZNRO', extension: 'asnrob', content: `﻿${SERVER}` }, 'H', undefined);

        expect(calls[0]!.body).toContain('adtcore:description="C2T"');
        expect(calls[1]!.body).toBe(SERVER);
        expect(calls[1]!.headers!['Content-Type']).toBe('application/json');
    });
});
