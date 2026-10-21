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
import { publishServiceBinding, unpublishServiceBinding } from '../../../../core/adt/businessservices/publish';
import { deleteServiceBinding } from '../../../../core/adt/businessservices/delete';
import { createServiceBinding } from '../../../../client/methods/craud/specialcases/businessservices/createServiceBinding';
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
        // Lock must be released after publishing.
        expect(calls[2]!.params).toMatchObject({ _action: 'UNLOCK', lockHandle: 'HANDLE123' });
    });
});

describe('unpublishServiceBinding', () => {
    it('locks the binding then submits an unpublish job', async () => {
        const { requestor, calls } = mockRequestor((req) => {
            if (req.params?.['_action'] === 'LOCK') return new Response(lockXml('HANDLE123'), { status: 200 });
            return new Response(severityXml('OK', 'ZB_O5 un-published locally'), { status: 200 });
        });

        const [message, error] = await unpublishServiceBinding(requestor, 'ZB_O5');

        expect(error).toBeNull();
        expect(message).toBe('ZB_O5 un-published locally');
        expect(calls[0]!.path).toBe('/sap/bc/adt/businessservices/bindings/zb_o5');
        expect(calls[1]!.path).toBe('/sap/bc/adt/businessservices/odatav4/unpublishjobs');
        expect(calls[1]!.body).toContain('adtcore:type="SCGR"');
        // Lock must be released after unpublishing.
        expect(calls[2]!.params).toMatchObject({ _action: 'UNLOCK', lockHandle: 'HANDLE123' });
    });
});

describe('deleteServiceBinding', () => {
    it('unpublishes then deletes the binding', async () => {
        const { requestor, calls } = mockRequestor((req) => {
            if (req.params?.['_action'] === 'LOCK') return new Response(lockXml('HANDLE123'), { status: 200 });
            if (req.path.endsWith('/unpublishjobs')) return new Response(severityXml('OK', 'un-published'), { status: 200 });
            return new Response('', { status: 200 });
        });

        const [, error] = await deleteServiceBinding(requestor, 'ZB_O5', 'SDSK900001');

        expect(error).toBeNull();
        expect(calls.some(c => c.path.endsWith('/unpublishjobs'))).toBe(true);
        const del = calls.find(c => c.method === 'DELETE')!;
        expect(del.path).toBe('/sap/bc/adt/businessservices/bindings/zb_o5');
        expect(del.params).toMatchObject({ lockHandle: 'HANDLE123', corrNr: 'SDSK900001' });
    });

    it('still deletes when the binding was not published', async () => {
        const { requestor, calls } = mockRequestor((req) => {
            if (req.params?.['_action'] === 'LOCK') return new Response(lockXml('HANDLE123'), { status: 200 });
            if (req.path.endsWith('/unpublishjobs')) return new Response(severityXml('ERROR', 'not published'), { status: 200 });
            return new Response('', { status: 200 });
        });

        const [, error] = await deleteServiceBinding(requestor, 'ZB_O5', undefined);

        expect(error).toBeNull();
        expect(calls.some(c => c.method === 'DELETE')).toBe(true);
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

describe('OData V2 bindings', () => {
    const V2_OPTIONS = { ...BASE_OPTIONS, bindingName: 'ZB_API_V2', bindingVersion: 'V2' as const };
    const V2_PUBLISH_PATH = '/sap/bc/adt/businessservices/odatav2/publishjobs';
    const V2_UNPUBLISH_PATH = '/sap/bc/adt/businessservices/odatav2/unpublishjobs';

    function v2Responder(unpublishOk: (path: string) => boolean): Responder {
        return (req) => {
            if (req.params?.['_action'] === 'LOCK') return new Response(lockXml('HANDLE123'), { status: 200 });
            if (req.path.endsWith('/unpublishjobs')) {
                return new Response(unpublishOk(req.path) ? severityXml('OK', 'un-published') : severityXml('ERROR', 'not published'), { status: 200 });
            }
            return new Response('', { status: 200 });
        };
    }

    it('validates with the V2 binding version', async () => {
        const { requestor, calls } = mockRequestor(() => new Response(severityXml('OK'), { status: 200 }));

        const [, error] = await validateServiceBinding(requestor, V2_OPTIONS);

        expect(error).toBeNull();
        expect(calls[0]!.params).toMatchObject({ serviceBindingVersion: 'ODATA\\V2' });
    });

    it('creates a V2 Web API binding', async () => {
        const { requestor, calls } = mockRequestor(() => new Response('', { status: 201 }));

        const [, error] = await createServiceBindingObject(requestor, V2_OPTIONS, 'ebosch');

        expect(error).toBeNull();
        expect(calls[0]!.body).toContain('srvb:binding srvb:category="1" srvb:type="ODATA" srvb:version="V2"');
        expect(calls[0]!.body).toContain('adtcore:name="ZB_API_V2"');
    });

    it('publishes through the odatav2 job with the service name and version', async () => {
        const { requestor, calls } = mockRequestor((req) => {
            if (req.params?.['_action'] === 'LOCK') return new Response(lockXml('HANDLE123'), { status: 200 });
            return new Response(severityXml('OK', 'ZB_API_V2 published locally'), { status: 200 });
        });

        const [message, error] = await publishServiceBinding(requestor, 'zb_api_v2', 'V2');

        expect(error).toBeNull();
        expect(message).toBe('ZB_API_V2 published locally');
        expect(calls[1]!.path).toBe(V2_PUBLISH_PATH);
        expect(calls[1]!.params).toEqual({ servicename: 'ZB_API_V2', serviceversion: '0001' });
        expect(calls[1]!.body).toContain('adtcore:name="ZB_API_V2"');
        expect(calls[2]!.params).toMatchObject({ _action: 'UNLOCK', lockHandle: 'HANDLE123' });
    });

    it('keeps the V4 publish job free of query parameters', async () => {
        const { requestor, calls } = mockRequestor((req) => {
            if (req.params?.['_action'] === 'LOCK') return new Response(lockXml('HANDLE123'), { status: 200 });
            return new Response(severityXml('OK'), { status: 200 });
        });

        const [, error] = await publishServiceBinding(requestor, 'ZB_O5');

        expect(error).toBeNull();
        expect(calls[1]!.path).toBe('/sap/bc/adt/businessservices/odatav4/publishjobs');
        expect(calls[1]!.params).toEqual({});
    });

    it('unpublishes through the odatav2 job', async () => {
        const { requestor, calls } = mockRequestor(v2Responder(() => true));

        const [, error] = await unpublishServiceBinding(requestor, 'ZB_API_V2', 'V2');

        expect(error).toBeNull();
        expect(calls[1]!.path).toBe(V2_UNPUBLISH_PATH);
        expect(calls[1]!.params).toEqual({ servicename: 'ZB_API_V2', serviceversion: '0001' });
    });

    it('deletes a V2 binding with only the V2 unpublish when the version is given', async () => {
        const { requestor, calls } = mockRequestor(v2Responder(() => true));

        const [, error] = await deleteServiceBinding(requestor, 'ZB_API_V2', undefined, 'V2');

        expect(error).toBeNull();
        expect(calls.filter(c => c.path.endsWith('/unpublishjobs')).map(c => c.path)).toEqual([V2_UNPUBLISH_PATH]);
        expect(calls.some(c => c.method === 'DELETE')).toBe(true);
    });

    it('falls back to the V2 unpublish when the version is unknown and V4 fails', async () => {
        const { requestor, calls } = mockRequestor(v2Responder(path => path === V2_UNPUBLISH_PATH));

        const [, error] = await deleteServiceBinding(requestor, 'ZB_API_V2', undefined);

        expect(error).toBeNull();
        expect(calls.filter(c => c.path.endsWith('/unpublishjobs')).map(c => c.path))
            .toEqual(['/sap/bc/adt/businessservices/odatav4/unpublishjobs', V2_UNPUBLISH_PATH]);
        expect(calls.some(c => c.method === 'DELETE')).toBe(true);
    });

    it('stops after the V4 unpublish when it succeeds', async () => {
        const { requestor, calls } = mockRequestor(v2Responder(() => true));

        const [, error] = await deleteServiceBinding(requestor, 'ZB_O5', undefined);

        expect(error).toBeNull();
        expect(calls.filter(c => c.path.endsWith('/unpublishjobs'))).toHaveLength(1);
    });

    it('publishes a V2 binding through the odatav2 job in the orchestration', async () => {
        const { requestor, calls } = mockRequestor(lifecycleResponder());

        const [result, error] = await createServiceBinding(STATE, requestor, V2_OPTIONS);

        expect(error).toBeNull();
        expect(result?.published).toBe(true);
        const publish = calls.find(c => c.path.endsWith('/publishjobs'))!;
        expect(publish.path).toBe(V2_PUBLISH_PATH);
        expect(publish.params).toEqual({ servicename: 'ZB_API_V2', serviceversion: '0001' });
    });
});
