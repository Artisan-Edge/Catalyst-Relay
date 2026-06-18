/**
 * Unit Tests for createObject XML building
 *
 * Verifies the create-shell builder handles per-type quirks:
 * - Service definitions (.srvd) add srvd:srvdSourceType="S"
 * - Behavior definitions (.asbdef) add an adtTemplate implementation_type block
 * - Existing source types are unaffected
 */

import { describe, it, expect } from 'bun:test';
import { createObject } from '../../../../core/adt/craud/create';
import type { AdtRequestor } from '../../../../core/adt';
import { BehaviorImplementationType } from '../../../../types/requests';

interface RecordedRequest {
    method: string;
    path: string;
    params?: Record<string, string | number>;
    headers?: Record<string, string>;
    body?: string;
}

function mockRequestor(status = 201): { requestor: AdtRequestor; calls: RecordedRequest[] } {
    const calls: RecordedRequest[] = [];
    const requestor: AdtRequestor = {
        request: async (options) => {
            const call: RecordedRequest = { method: options.method, path: options.path };
            if (options.params) call.params = options.params as Record<string, string | number>;
            if (options.headers) call.headers = options.headers;
            if (options.body !== undefined) call.body = options.body;
            calls.push(call);
            return [new Response('', { status }), null];
        },
    };
    return { requestor, calls };
}

describe('createObject', () => {
    it('builds a service definition (.srvd) shell with srvdSourceType', async () => {
        const { requestor, calls } = mockRequestor();

        const [, error] = await createObject(
            requestor,
            { name: 'ZTEST_SRVD', extension: 'srvd', content: 'define service ...' },
            'ZBEACON',
            'SDSK900001',
            'ebosch'
        );

        expect(error).toBeNull();
        const call = calls[0]!;
        expect(call.method).toBe('POST');
        expect(call.path).toBe('/sap/bc/adt/ddic/srvd/sources');
        expect(call.params).toEqual({ corrNr: 'SDSK900001' });
        expect(call.body).toContain('srvd:srvdSource');
        expect(call.body).toContain('xmlns:srvd="http://www.sap.com/adt/ddic/srvdsources"');
        expect(call.body).toContain('srvd:srvdSourceType="S"');
        expect(call.body).toContain('adtcore:name="ZTEST_SRVD"');
        expect(call.body).toContain('adtcore:type="SRVD/SRV"');
    });

    it('builds a behavior definition (.asbdef) shell with the implementation type', async () => {
        const { requestor, calls } = mockRequestor();

        const [, error] = await createObject(
            requestor,
            {
                name: 'ZTEST_BDEF',
                extension: 'asbdef',
                content: 'managed implementation in class zcl_x unique;',
                implementationType: BehaviorImplementationType.Managed,
            },
            'ZBEACON',
            undefined,
            'ebosch'
        );

        expect(error).toBeNull();
        const call = calls[0]!;
        expect(call.path).toBe('/sap/bc/adt/bo/behaviordefinitions');
        expect(call.params).toEqual({});
        expect(call.body).toContain('blue:blueSource');
        expect(call.body).toContain('adtcore:type="BDEF/BDO"');
        expect(call.body).toContain('<adtcore:adtProperty adtcore:key="implementation_type">Managed</adtcore:adtProperty>');
    });

    it('defaults the behavior definition implementation type to Managed', async () => {
        const { requestor, calls } = mockRequestor();

        await createObject(
            requestor,
            { name: 'ZTEST_BDEF', extension: 'asbdef', content: 'managed ...' },
            'ZBEACON',
            undefined,
            'ebosch'
        );

        expect(calls[0]!.body).toContain('implementation_type">Managed<');
    });

    it('leaves existing source types unchanged', async () => {
        const { requestor, calls } = mockRequestor();

        await createObject(
            requestor,
            { name: 'ZTEST_VIEW', extension: 'asddls', content: '' },
            'ZBEACON',
            undefined,
            'ebosch'
        );

        const body = calls[0]!.body!;
        expect(body).toContain('ddl:ddlSource');
        expect(body).not.toContain('adtTemplate');
        expect(body).not.toContain('srvdSourceType');
    });
});
