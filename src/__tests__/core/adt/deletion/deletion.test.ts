/**
 * Unit Tests for the generic ADT deletion service (/deletion/check, /deletion/delete) and app variant delete
 *
 * Fixtures: the app variant deletion captured on Madiba-Cloud-Dev.
 */

import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { checkDeletion, parseDeletionCheck } from '../../../../core/adt/deletion/checkDeletion';
import { deleteByUri, parseDeletionResult } from '../../../../core/adt/deletion/deleteByUri';
import { appVariantUri } from '../../../../core/adt/deletion/appVariant';
import { deleteAppVariant } from '../../../../client/methods/deletion/deletion';
import type { AdtRequestor } from '../../../../core/adt';
import type { ClientState } from '../../../../client/types';

const FIXTURES = path.join(import.meta.dir, '../../../fixtures/iam');
const fixture = (name: string): string => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const STATE = { session: { username: 'U' } } as unknown as ClientState;
const URI = '/sap/bc/adt/vit/wb/object_type/advclrp/object_name/ZR5YJ7I4MCCPGM3EDSH2LIKOARU';

interface Call { method: string; path: string; headers?: Record<string, string>; body?: string }

function recorder(respond: (call: Call) => Response): { requestor: AdtRequestor; calls: Call[] } {
    const calls: Call[] = [];
    const requestor: AdtRequestor = {
        request: async (options) => {
            const call: Call = { method: options.method, path: options.path };
            if (options.headers) call.headers = options.headers;
            if (options.body !== undefined) call.body = options.body;
            calls.push(call);
            return [respond(call), null];
        },
    };
    return { requestor, calls };
}

describe('deletion service parsing', () => {
    it('parses a deletion check', () => {
        const [results, error] = parseDeletionCheck(fixture('deletion-check-advc.xml'));

        expect(error).toBeNull();
        expect(results).toEqual([{ uri: URI, name: 'ZR5YJ7I4MCCPGM3EDSH2LIKOARU', type: 'ADVC/LRP', packageName: 'ZSNAP_BC', isDeletable: true, externalStrongReferences: 0, externalWeakReferences: 0, recording: false, lockingTransport: '', messages: [] }]);
    });

    it('parses a deletion result', () => {
        const [results, error] = parseDeletionResult(fixture('deletion-delete-advc.xml'));

        expect(error).toBeNull();
        expect(results).toEqual([{ uri: URI, name: 'ZR5YJ7I4MCCPGM3EDSH2LIKOARU', type: 'ADVC/LRP', packageName: 'ZSNAP_BC', isDeleted: true, messages: [] }]);
    });

    it('keeps messages with a text', () => {
        const xml = fixture('deletion-check-advc.xml').replace('del:isDeletable="true"', 'del:isDeletable="false"').replace('<del:message del:priority="0" del:type="S"><del:text/></del:message>', '<del:message del:priority="1" del:type="E"><del:text>Still used</del:text></del:message>');

        const [results] = parseDeletionCheck(xml);

        expect(results?.[0]?.isDeletable).toBe(false);
        expect(results?.[0]?.messages).toEqual([{ type: 'E', text: 'Still used' }]);
    });
});

describe('deletion service requests', () => {
    it('posts a check request with the check media type', async () => {
        const { requestor, calls } = recorder(() => new Response(fixture('deletion-check-advc.xml')));

        await checkDeletion(requestor, [URI]);

        expect(calls[0]!.path).toBe('/sap/bc/adt/deletion/check');
        expect(calls[0]!.headers?.['Content-Type']).toBe('application/vnd.sap.adt.deletion.check.request.v1+xml');
        expect(calls[0]!.body).toContain(`<del:checkRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core"><del:object adtcore:uri="${URI}"/></del:checkRequest>`);
    });

    it('posts a deletion request with the transport number', async () => {
        const { requestor, calls } = recorder(() => new Response(fixture('deletion-delete-advc.xml')));

        await deleteByUri(requestor, [URI], 'TR1');
        await deleteByUri(requestor, [URI]);

        expect(calls[0]!.path).toBe('/sap/bc/adt/deletion/delete');
        expect(calls[0]!.headers?.['Content-Type']).toBe('application/vnd.sap.adt.deletion.request.v1+xml');
        expect(calls[0]!.body).toContain(`<del:object adtcore:uri="${URI}"><del:transportNumber>TR1</del:transportNumber></del:object>`);
        expect(calls[1]!.body).toContain('<del:transportNumber/>');
    });

    it('sends nothing for no URIs', async () => {
        const { requestor, calls } = recorder(() => new Response(''));

        expect(await checkDeletion(requestor, [])).toEqual([[], null]);
        expect(calls).toHaveLength(0);
    });
});

describe('deleteAppVariant', () => {
    it('builds the vit URI', () => {
        expect(appVariantUri('zr5yj7i4mccpgm3edsh2likoaru')).toBe(URI);
    });

    it('checks, then deletes', async () => {
        const { requestor, calls } = recorder((call) => new Response(fixture(call.path.endsWith('/check') ? 'deletion-check-advc.xml' : 'deletion-delete-advc.xml')));

        const [result, error] = await deleteAppVariant(STATE, requestor, 'ZR5YJ7I4MCCPGM3EDSH2LIKOARU');

        expect(error).toBeNull();
        expect(result?.isDeleted).toBe(true);
        expect(calls.map(c => c.path)).toEqual(['/sap/bc/adt/deletion/check', '/sap/bc/adt/deletion/delete']);
    });

    it('refuses without deleting when the check says not deletable', async () => {
        const notDeletable = fixture('deletion-check-advc.xml').replace('del:isDeletable="true"', 'del:isDeletable="false"').replace('<del:text/>', '<del:text>Used by X</del:text>');
        const { requestor, calls } = recorder(() => new Response(notDeletable));

        const [, error] = await deleteAppVariant(STATE, requestor, 'ZR5YJ7I4MCCPGM3EDSH2LIKOARU');

        expect(error?.message).toBe('App variant ZR5YJ7I4MCCPGM3EDSH2LIKOARU cannot be deleted: Used by X');
        expect(calls).toHaveLength(1);
    });

    it('refuses without deleting when the package records changes and no transport is given', async () => {
        const recording = fixture('deletion-check-advc.xml').replace('<del:recording>false</del:recording>', '<del:recording>true</del:recording>');
        const { requestor, calls } = recorder((call) => new Response(call.path.endsWith('/check') ? recording : fixture('deletion-delete-advc.xml')));

        const [, error] = await deleteAppVariant(STATE, requestor, 'ZR5YJ7I4MCCPGM3EDSH2LIKOARU');
        const [result] = await deleteAppVariant(STATE, requestor, 'ZR5YJ7I4MCCPGM3EDSH2LIKOARU', 'TR1');

        expect(error?.message).toBe('App variant ZR5YJ7I4MCCPGM3EDSH2LIKOARU is in package ZSNAP_BC, which records changes; give a transport request');
        expect(result?.isDeleted).toBe(true);
        expect(calls.map(c => c.path)).toEqual(['/sap/bc/adt/deletion/check', '/sap/bc/adt/deletion/check', '/sap/bc/adt/deletion/delete']);
        expect(calls[2]!.body).toContain('<del:transportNumber>TR1</del:transportNumber>');
    });

    it('fails when SAP reports the variant not deleted', async () => {
        const { requestor } = recorder((call) => new Response(call.path.endsWith('/check') ? fixture('deletion-check-advc.xml') : fixture('deletion-delete-advc.xml').replace('del:isDeleted="true"', 'del:isDeleted="false"')));

        const [, error] = await deleteAppVariant(STATE, requestor, 'ZR5YJ7I4MCCPGM3EDSH2LIKOARU');

        expect(error?.message).toBe('App variant ZR5YJ7I4MCCPGM3EDSH2LIKOARU was not deleted');
    });
});
