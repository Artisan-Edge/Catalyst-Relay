/**
 * Unit Tests for Service Binding operations
 *
 * Covers the core sub-functions (validate, create, publish) and the client
 * orchestration (validate → create → activate → publish), all against a mocked
 * AdtRequestor.
 */

import { describe, it, expect } from 'bun:test';
import { validateServiceBinding } from '../../../../core/adt/businessservices/validate';
import { createServiceBindingObject } from '../../../../core/adt/businessservices/create';
import { publishServiceBinding } from '../../../../core/adt/businessservices/publish';
import { createServiceBinding } from '../../../../client/methods/businessservices/createServiceBinding';
import type { AdtRequestor } from '../../../../core/adt';
import type { ClientState } from '../../../../client/types';

interface RecordedRequest {
    method: string;
    path: string;
    params?: Record<string, string | number>;
    headers?: Record<string, string>;
    body?: string;
}

type Responder = (req: RecordedRequest) => Response;

function mockRequestor(responder: Responder): { requestor: AdtRequestor; calls: RecordedRequest[] } {
    const calls: RecordedRequest[] = [];
    const requestor: AdtRequestor = {
        request: async (options) => {
            const call: RecordedRequest = { method: options.method, path: options.path };
            if (options.params) call.params = options.params as Record<string, string | number>;
            if (options.headers) call.headers = options.headers;
            if (options.body !== undefined) call.body = options.body;
            calls.push(call);
            return [responder(call), null];
        },
    };
    return { requestor, calls };
}

function severityXml(severity: string, shortText = ''): string {
    return `<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><SEVERITY>${severity}</SEVERITY><SHORT_TEXT>${shortText}</SHORT_TEXT><LONG_TEXT/></DATA></asx:values></asx:abap>`;
}

function lockXml(handle: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><LOCK_HANDLE>${handle}</LOCK_HANDLE></DATA></asx:values></asx:abap>`;
}

const STATE = { session: { username: 'EBOSCH' } } as unknown as ClientState;

const BASE_OPTIONS = {
    bindingName: 'ZB_O5',
    serviceDefinition: 'ZB_API',
    packageName: 'ZBEACON',
    description: 'desc',
    transport: 'SDSK900001',
};

/** Full happy-path responder covering every endpoint in the lifecycle. */
function lifecycleResponder(): Responder {
    return (req) => {
        const p = req.path;
        if (p.endsWith('/validation')) return new Response(severityXml('OK'), { status: 200 });
        if (p.endsWith('/publishjobs')) return new Response(severityXml('OK', 'ZB_O5 published locally'), { status: 200 });
        if (req.params?.['_action'] === 'LOCK') return new Response(lockXml('HANDLE123'), { status: 200 });
        if (p === '/sap/bc/adt/businessservices/bindings') return new Response('', { status: 201 });
        if (p === '/sap/bc/adt/activation/runs') {
            return new Response('', { status: 201, headers: { Location: '/sap/bc/adt/activation/runs/RUN1' } });
        }
        if (p.startsWith('/sap/bc/adt/activation/runs/')) return new Response('', { status: 200 });
        if (p.startsWith('/sap/bc/adt/activation/results/')) {
            return new Response('<?xml version="1.0"?><root></root>', { status: 200 });
        }
        return new Response('', { status: 200 });
    };
}

describe('validateServiceBinding', () => {
    it('posts to the validation endpoint with the expected params', async () => {
        const { requestor, calls } = mockRequestor(() => new Response(severityXml('OK'), { status: 200 }));

        const [, error] = await validateServiceBinding(requestor, BASE_OPTIONS);

        expect(error).toBeNull();
        const call = calls[0]!;
        expect(call.method).toBe('POST');
        expect(call.path).toBe('/sap/bc/adt/businessservices/bindings/validation');
        expect(call.params).toMatchObject({
            objname: 'ZB_O5',
            serviceDefinition: 'ZB_API',
            package: 'ZBEACON',
            serviceBindingVersion: 'ODATA\\V4',
        });
    });

    it('returns an error on a non-OK severity', async () => {
        const { requestor } = mockRequestor(() => new Response(severityXml('ERROR', 'name in use'), { status: 200 }));

        const [, error] = await validateServiceBinding(requestor, BASE_OPTIONS);

        expect(error).not.toBeNull();
        expect(error?.message).toContain('name in use');
    });
});

describe('createServiceBindingObject', () => {
    it('posts the srvb XML body to the bindings endpoint', async () => {
        const { requestor, calls } = mockRequestor(() => new Response('', { status: 201 }));

        const [, error] = await createServiceBindingObject(requestor, BASE_OPTIONS, 'ebosch');

        expect(error).toBeNull();
        const call = calls[0]!;
        expect(call.path).toBe('/sap/bc/adt/businessservices/bindings');
        expect(call.params).toEqual({ corrNr: 'SDSK900001' });
        expect(call.body).toContain('srvb:serviceBinding');
        expect(call.body).toContain('adtcore:name="ZB_O5"');
        expect(call.body).toContain('adtcore:type="SRVB/SVB"');
        expect(call.body).toContain('srvb:services srvb:name="ZB_API"');
        expect(call.body).toContain('<srvb:serviceDefinition adtcore:name="ZB_API"/>');
        expect(call.body).toContain('srvb:binding srvb:category="1" srvb:type="ODATA" srvb:version="V4"');
    });
});

describe('publishServiceBinding', () => {
    it('locks the binding then submits a publish job', async () => {
        const { requestor, calls } = mockRequestor((req) => {
            if (req.params?.['_action'] === 'LOCK') return new Response(lockXml('HANDLE123'), { status: 200 });
            return new Response(severityXml('OK', 'ZB_O5 published locally'), { status: 200 });
        });

        const [message, error] = await publishServiceBinding(requestor, 'ZB_O5');

        expect(error).toBeNull();
        expect(message).toBe('ZB_O5 published locally');
        expect(calls[0]!.path).toBe('/sap/bc/adt/businessservices/bindings/zb_o5');
        expect(calls[0]!.params).toMatchObject({ _action: 'LOCK', accessMode: 'MODIFY' });
        expect(calls[1]!.path).toBe('/sap/bc/adt/businessservices/odatav4/publishjobs');
        expect(calls[1]!.body).toContain('adtcore:type="SCGR"');
        expect(calls[1]!.body).toContain('adtcore:name="ZB_O5"');
    });
});

describe('createServiceBinding (orchestration)', () => {
    it('runs validate → create → activate → publish on the happy path', async () => {
        const { requestor, calls } = mockRequestor(lifecycleResponder());

        const [result, error] = await createServiceBinding(STATE, requestor, BASE_OPTIONS);

        expect(error).toBeNull();
        expect(result?.created).toBe(true);
        expect(result?.published).toBe(true);
        expect(result?.publishMessage).toBe('ZB_O5 published locally');

        const paths = calls.map(c => c.path);
        expect(paths).toContain('/sap/bc/adt/businessservices/bindings/validation');
        expect(paths).toContain('/sap/bc/adt/businessservices/bindings');
        expect(paths).toContain('/sap/bc/adt/activation/runs');
        expect(paths).toContain('/sap/bc/adt/businessservices/odatav4/publishjobs');
    });

    it('aborts before create when validation fails', async () => {
        const { requestor, calls } = mockRequestor((req) => {
            if (req.path.endsWith('/validation')) return new Response(severityXml('ERROR', 'bad'), { status: 200 });
            return new Response('', { status: 201 });
        });

        const [result, error] = await createServiceBinding(STATE, requestor, BASE_OPTIONS);

        expect(result).toBeNull();
        expect(error).not.toBeNull();
        expect(calls).toHaveLength(1);
        expect(calls[0]!.path).toBe('/sap/bc/adt/businessservices/bindings/validation');
    });

    it('skips publish when publish is false', async () => {
        const { requestor, calls } = mockRequestor(lifecycleResponder());

        const [result, error] = await createServiceBinding(STATE, requestor, { ...BASE_OPTIONS, publish: false });

        expect(error).toBeNull();
        expect(result?.published).toBe(false);
        expect(calls.map(c => c.path)).not.toContain('/sap/bc/adt/businessservices/odatav4/publishjobs');
    });
});
