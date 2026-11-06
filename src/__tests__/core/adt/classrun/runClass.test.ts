/**
 * Unit Tests for the stateless class run (/oo/classrun)
 *
 * Fixture: a scoping class run captured on Madiba-Cloud-Dev (2026-11-05).
 */

import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { runClass } from '../../../../core/adt/classrun/runClass';
import { runClass as clientRunClass } from '../../../../client/methods/classrun/runClass';
import type { ClientState } from '../../../../client/types';
import { recorder } from '../iam/iamTestKit';

const OUTPUT = fs.readFileSync(path.join(import.meta.dir, '../../../fixtures/classrun/scope-ok.txt'), 'utf8');
const text = (body: string, status = 200): Response => new Response(body, { status, headers: { 'content-type': 'text/plain' } });

describe('runClass', () => {
    it('posts stateless with Accept text/plain and returns the console text', async () => {
        const { requestor, calls } = recorder(() => text(OUTPUT));

        const [output, error] = await runClass(requestor, 'ZCL_SNAP_P0_SCOPE_OK');

        expect(error).toBeNull();
        expect(output).toBe(OUTPUT);
        expect(output?.split(/\r?\n/).filter(Boolean).at(-1)).toBe('result|ok|expected=2|changed=0|unchanged=2|failed=0');
        expect(calls[0]).toMatchObject({
            method: 'POST',
            path: '/sap/bc/adt/oo/classrun/zcl_snap_p0_scope_ok',
            headers: { 'Accept': 'text/plain', 'X-sap-adt-sessiontype': 'stateless' },
            timeout: 300_000,
        });
    });

    it('passes a custom timeout', async () => {
        const { requestor, calls } = recorder(() => text(''));

        await runClass(requestor, 'zcl_x', { timeoutMs: 5000 });

        expect(calls[0]!.timeout).toBe(5000);
        expect(calls[0]!.path).toBe('/sap/bc/adt/oo/classrun/zcl_x');
    });

    it('reports HTTP 500 as a dump and points to the dump list', async () => {
        const { requestor } = recorder(() => text('<html><body><h1>500 Internal Server Error</h1><p>The table area specified with FROM ... TO ... is invalid.</p></body></html>', 500));

        const [output, error] = await runClass(requestor, 'ZCL_SNAP_BC_SCOPE');

        expect(output).toBeNull();
        expect(error?.message).toContain('Class run of ZCL_SNAP_BC_SCOPE dumped (HTTP 500): 500 Internal Server Error The table area specified with FROM ... TO ... is invalid.');
        expect(error?.message).toContain('/sap/bc/adt/runtime/dumps');
        expect(error?.message).toContain('CL_ABAP_DOCU_CLASS_POOL');
    });

    it('reports a timeout as possibly still running', async () => {
        const { requestor } = recorder(() => new Error('Request timeout'));

        const [, error] = await runClass(requestor, 'ZCL_X', { timeoutMs: 120_000 });

        expect(error?.message).toBe('Class run of ZCL_X timed out after 120 s; it may still be running on SAP');
    });

    it('reports other HTTP errors with the SAP message', async () => {
        const exception = '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><message lang="EN">Class ZCL_NONE does not exist</message></exc:exception>';
        const { requestor } = recorder(() => text(exception, 404));

        const [, error] = await runClass(requestor, 'ZCL_NONE');

        expect(error?.message).toBe('Class run of ZCL_NONE failed: Class ZCL_NONE does not exist');
    });

    it('reports a missing class (SAP answers 200 with a text)', async () => {
        const { requestor } = recorder(() => text('Object ZSNAP_BC_CLI_RUN of type CLAS does not exist.\n'));

        const [output, error] = await runClass(requestor, 'ZSNAP_BC_CLI_RUN');

        expect(output).toBeNull();
        expect(error?.message).toBe('Class run of ZSNAP_BC_CLI_RUN failed: Object ZSNAP_BC_CLI_RUN of type CLAS does not exist.');
    });

    it('refuses a 200 HTML page (a logon page) as console output', async () => {
        const { requestor } = recorder(() => new Response('<!DOCTYPE html><html><body>Logon</body></html>', { status: 200, headers: { 'content-type': 'text/html' } }));

        const [output, error] = await runClass(requestor, 'ZCL_X');

        expect(output).toBeNull();
        expect(error?.message).toBe('Class run of ZCL_X failed: unexpected HTML response: Logon');
    });

    it('refuses an empty class name without a request', async () => {
        const { requestor, calls } = recorder(() => text(''));

        const [, error] = await runClass(requestor, '  ');

        expect(error?.message).toBe('Class run: class name is required');
        expect(calls).toHaveLength(0);
    });

    it('needs a session through the client method', async () => {
        const { requestor } = recorder(() => text(''));

        const [, error] = await clientRunClass({ session: null } as unknown as ClientState, requestor, 'ZCL_X');

        expect(error?.message).toBe('Not logged in');
    });
});
