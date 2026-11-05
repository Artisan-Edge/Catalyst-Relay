/**
 * Unit Tests for content comparison (upsert "unchanged") and AFF JSON sources (.asnrob)
 *
 * - AFF JSON compares as values: key order, 1 vs 1.0, whitespace and a BOM are no change
 * - Non-JSON falls back to normalized text
 * - CDS sources ignore whitespace next to separators (strict with a backslash); ABAP compares
 *   line by line, except whitespace in a function module signature
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
    it('compares ABAP source line by line, BOM, line ends and trailing blanks ignored', () => {
        expect(contentEquivalent('asprog', '﻿REPORT z.\n', 'REPORT z.\r\n')).toEqual([true, null]);
        expect(contentEquivalent('asprog', 'REPORT z.  \nWRITE 1.\n\n', 'REPORT z.\r\nWRITE 1.')).toEqual([true, null]);
    });

    it('has no false equivalents in ABAP sources', () => {
        const pairs: [string, string][] = [
            ['a = 1. " c\nb = 2.', 'a = 1. " c b = 2.'],
            ['* c\nb = 2.', '* c b = 2.'],
            ["x = 'a  b'.", "x = 'a b'."],
            ['x = |a  b|.', 'x = |a b|.'],
            ['IF a = 1.\n  b = 2.\nENDIF.', 'IF a = 1.\nb = 2.\nENDIF.'],
        ];
        for (const extension of ['asprog', 'asinc', 'aclass', 'asfugr', 'asfinc']) {
            for (const [local, remote] of pairs) expect(contentEquivalent(extension, local, remote)).toEqual([false, null]);
        }
    });

    it("ignores ADT's layout of a function module signature only", () => {
        const sap = 'FUNCTION z_hello\r\n  IMPORTING\r\n    VALUE(name) TYPE string\r\n  EXPORTING\r\n    VALUE(result) TYPE string.\r\n\r\n  result = name.\r\nENDFUNCTION.';
        const local = 'FUNCTION z_hello IMPORTING VALUE(name) TYPE string\n    EXPORTING VALUE(result) TYPE string.\n\n  result = name.\nENDFUNCTION.\n';
        expect(contentEquivalent('asfunc', local, sap)).toEqual([true, null]);
        expect(contentEquivalent('asfunc', local.replace('  result', 'result'), sap)).toEqual([false, null]);
        expect(contentEquivalent('asfunc', local.replace('VALUE(name) TYPE string', 'VALUE(name) TYPE i'), sap)).toEqual([false, null]);
        // Literals and comments in the signature are compared strictly
        const withDefault = sap.replace('TYPE string\r\n  EXPORTING', "TYPE string DEFAULT 'a  b'\r\n  EXPORTING");
        expect(contentEquivalent('asfunc', withDefault.replace("'a  b'", "'a b'"), withDefault)).toEqual([false, null]);
        expect(contentEquivalent('asfunc', withDefault.replace('\r\n  EXPORTING', ' EXPORTING'), withDefault)).toEqual([false, null]);
    });

    it('compares CDS sources with a backslash strictly', () => {
        const sap = "@A.x : 'C:\\', @B.y : 'a : b'\r\ndefine table z {\r\n}";
        expect(contentEquivalent('astabldt', "@A.x : 'C:\\', @B.y : 'a: b'\ndefine table z {\n}", sap)).toEqual([false, null]);
        expect(contentEquivalent('astabldt', "@A.x: 'C:\\', @B.y: 'a : b'\ndefine table z {\n}", sap)).toEqual([false, null]);
        expect(contentEquivalent('astabldt', "@A.x : 'C:\\', @B.y : 'a : b'\ndefine table z {\n}\n", sap)).toEqual([true, null]);
    });

    it('says when the server side of a form object does not parse', () => {
        const local = '{ "description": "D", "messages": [] }';
        expect(contentEquivalent('asmsag', local, '{ not json')[1]?.message).toStartWith('server content: ');
    });

    it('ignores the re-layout SAP applies to CDS sources on activation', () => {
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
