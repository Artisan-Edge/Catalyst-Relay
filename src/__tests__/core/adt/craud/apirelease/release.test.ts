/**
 * Unit Tests for API release state changes
 *
 * - release / unrelease are no-ops when already in the target state
 * - release defaults to Cloud Development only
 * - visibility updates merge flags, preview runs validation only
 */

import { describe, it, expect } from 'bun:test';
import { releaseApi, unreleaseApi } from '../../../../../core/adt/craud/apirelease/release';
import { updateApiReleaseVisibility } from '../../../../../core/adt/craud/apirelease/visibility';
import type { AdtRequestor } from '../../../../../core/adt';

interface RecordedRequest {
    method: string;
    path: string;
    body?: string;
}

function contractXml(state: string, cloudDev: boolean, keyUser: boolean): string {
    return `<?xml version="1.0" encoding="UTF-8"?><ars:apiRelease xmlns:ars="http://www.sap.com/adt/ars">
  <ars:releasableObject xmlns:adtcore="http://www.sap.com/adt/core" adtcore:uri="/sap/bc/adt/ddic/ddl/sources/zv_q01" adtcore:name="ZV_Q01"/>
  <ars:c1Release ars:contract="C1" ars:useInKeyUserApps="${keyUser}" ars:useInSAPCloudPlatform="${cloudDev}">
    <ars:status ars:state="${state}"/>
  </ars:c1Release>
</ars:apiRelease>`;
}

const NO_MESSAGES = '<?xml version="1.0" encoding="UTF-8"?><ars:apiRelease xmlns:ars="http://www.sap.com/adt/ars"/>';

// GET answers with the current contract; the validation run passes; the PUT echoes the body's state and flags.
function mockRequestor(state: string, cloudDev: boolean, keyUser: boolean): { requestor: AdtRequestor; calls: RecordedRequest[] } {
    const calls: RecordedRequest[] = [];
    const requestor: AdtRequestor = {
        request: async (options) => {
            const call: RecordedRequest = { method: options.method, path: options.path };
            if (options.body !== undefined) call.body = options.body;
            calls.push(call);

            if (options.method === 'GET') return [new Response(contractXml(state, cloudDev, keyUser)), null];
            if (options.path.endsWith('/validationrun')) return [new Response(NO_MESSAGES), null];

            const body = options.body ?? '';
            const target = /ars:state="([A-Z_]+)"/.exec(body)?.[1] ?? state;
            const echoed = contractXml(target, body.includes('useInSAPCloudPlatform="true"'), body.includes('useInKeyUserApps="true"'));
            return [new Response(echoed), null];
        },
    };
    return { requestor, calls };
}

const puts = (calls: RecordedRequest[]) => calls.filter(c => c.method === 'PUT');

describe('releaseApi', () => {
    it('releases for Cloud Development only by default', async () => {
        const { requestor, calls } = mockRequestor('NOT_RELEASED', false, false);

        const [result, error] = await releaseApi(requestor, 'ZV_Q01');

        expect(error).toBeNull();
        expect(result!.changed).toBe(true);
        expect(result!.visibility).toEqual({ useInCloudDevelopment: true, useInKeyUserApps: false });
        expect(puts(calls)).toHaveLength(1);
    });

    it('leaves an already released object untouched', async () => {
        const { requestor, calls } = mockRequestor('RELEASED', true, true);

        const [result, error] = await releaseApi(requestor, 'ZV_Q01');

        expect(error).toBeNull();
        expect(result!.changed).toBe(false);
        expect(result!.visibility).toEqual({ useInCloudDevelopment: true, useInKeyUserApps: true });
        expect(result!.messages[0]!.text).toContain('was not applied');
        expect(calls.map(c => c.method)).toEqual(['GET']);
    });

    it('rejects a release with no visibility before any request', async () => {
        const { requestor, calls } = mockRequestor('NOT_RELEASED', false, false);

        const [, error] = await releaseApi(requestor, 'ZV_Q01', undefined, { useInCloudDevelopment: false, useInKeyUserApps: false });

        expect(error).not.toBeNull();
        expect(calls).toHaveLength(0);
    });
});

describe('unreleaseApi', () => {
    it('is a no-op when already not released', async () => {
        const { requestor, calls } = mockRequestor('NOT_RELEASED', false, false);

        const [result, error] = await unreleaseApi(requestor, 'ZV_Q01');

        expect(error).toBeNull();
        expect(result!.changed).toBe(false);
        expect(calls.map(c => c.method)).toEqual(['GET']);
    });

    it('sends the current visibility back unchanged', async () => {
        const { requestor, calls } = mockRequestor('RELEASED', true, false);

        await unreleaseApi(requestor, 'ZV_Q01');

        const body = puts(calls)[0]!.body!;
        expect(body).toContain('ars:state="NOT_RELEASED"');
        expect(body).toContain('ars:useInSAPCloudPlatform="true"');
        expect(body).toContain('ars:useInKeyUserApps="false"');
    });
});

describe('updateApiReleaseVisibility', () => {
    it('merges the change with the current flags and applies it', async () => {
        const { requestor, calls } = mockRequestor('RELEASED', true, false);

        const [result, error] = await updateApiReleaseVisibility(requestor, 'ZV_Q01', { useInKeyUserApps: true });

        expect(error).toBeNull();
        expect(result!.previous).toEqual({ useInCloudDevelopment: true, useInKeyUserApps: false });
        expect(result!.requested).toEqual({ useInCloudDevelopment: true, useInKeyUserApps: true });
        expect(result!.visibility).toEqual({ useInCloudDevelopment: true, useInKeyUserApps: true });
        expect(result!.changed).toBe(true);
        expect(puts(calls)).toHaveLength(1);
    });

    it('runs validation only in preview mode', async () => {
        const { requestor, calls } = mockRequestor('RELEASED', true, true);

        const [result, error] = await updateApiReleaseVisibility(requestor, 'ZV_Q01', { useInKeyUserApps: false }, { preview: true });

        expect(error).toBeNull();
        expect(result!.preview).toBe(true);
        expect(result!.changed).toBe(false);
        expect(result!.visibility).toEqual(result!.previous);
        expect(puts(calls)).toHaveLength(0);
        expect(calls.some(c => c.path.endsWith('/validationrun'))).toBe(true);
    });

    it('does nothing when the flags already match', async () => {
        const { requestor, calls } = mockRequestor('RELEASED', true, false);

        const [result] = await updateApiReleaseVisibility(requestor, 'ZV_Q01', { useInCloudDevelopment: true });

        expect(result!.changed).toBe(false);
        expect(calls.map(c => c.method)).toEqual(['GET']);
    });

    it('refuses an object that is not released', async () => {
        const { requestor } = mockRequestor('NOT_RELEASED', false, false);

        const [, error] = await updateApiReleaseVisibility(requestor, 'ZV_Q01', { useInKeyUserApps: true });

        expect(error!.message).toContain('not released');
    });

    it('refuses to turn both flags off', async () => {
        const { requestor } = mockRequestor('RELEASED', true, false);

        const [, error] = await updateApiReleaseVisibility(requestor, 'ZV_Q01', { useInCloudDevelopment: false });

        expect(error).not.toBeNull();
    });
});
