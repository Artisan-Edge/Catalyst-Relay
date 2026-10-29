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
import { readServiceBinding } from '../../../../core/adt/businessservices/read';
import { createServiceBinding } from '../../../../client/methods/craud/specialcases/businessservices/createServiceBinding';
import type { AdtRequestor } from '../../../../core/adt';
import type { ClientState } from '../../../../client/types';

interface RecordedRequest {
    method: string;
    path: string;
    params?: Record<string, string | number>;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
}

// A responder may answer with a transport-level error (e.g. a timeout) instead of a response.
type Responder = (req: RecordedRequest) => Response | Error;

function mockRequestor(responder: Responder): { requestor: AdtRequestor; calls: RecordedRequest[] } {
    const calls: RecordedRequest[] = [];
    const requestor: AdtRequestor = {
        request: async (options) => {
            const call: RecordedRequest = { method: options.method, path: options.path };
            if (options.params) call.params = options.params as Record<string, string | number>;
            if (options.headers) call.headers = options.headers;
            if (options.body !== undefined) call.body = options.body;
            if (options.timeout !== undefined) call.timeout = options.timeout;
            calls.push(call);
            const answer = responder(call);
            if (answer instanceof Error) return [null, answer];
            return [answer, null];
        },
    };
    return { requestor, calls };
}

// A servicebinding.v2 document as ADT returns it (shape taken from a public cloud tenant).
function bindingDocument(options: { name?: string; published?: boolean; category?: '0' | '1'; version?: string; definition?: string; active?: boolean } = {}): string {
    const name = options.name ?? 'ZB_O5';
    const definition = options.definition ?? 'ZB_API';
    return `<?xml version="1.0" encoding="utf-8"?><srvb:serviceBinding srvb:contract="C1" srvb:releaseSupported="true" srvb:published="${options.published ?? false}" srvb:bindingCreated="true" adtcore:name="${name}" adtcore:type="SRVB/SVB" adtcore:version="${options.active === false ? 'inactive' : 'active'}" adtcore:description="Test binding" xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings" xmlns:adtcore="http://www.sap.com/adt/core"><atom:link href="versions" rel="http://www.sap.com/adt/relations/versions" xmlns:atom="http://www.w3.org/2005/Atom"/><adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/zbeacon" adtcore:type="DEVC/K" adtcore:name="ZBEACON"/><srvb:services srvb:name="${definition}"><srvb:content srvb:version="0001" srvb:minorVersion="0" srvb:patchVersion="0" srvb:releaseState="NOT_RELEASED"><srvb:serviceDefinition adtcore:uri="/sap/bc/adt/ddic/srvd/sources/${definition.toLowerCase()}" adtcore:type="SRVD/SRV" adtcore:name="${definition}"/></srvb:content></srvb:services><srvb:binding srvb:type="ODATA" srvb:version="${options.version ?? 'V4'}" srvb:category="${options.category ?? '1'}"><srvb:implementation adtcore:name="${name}"/></srvb:binding></srvb:serviceBinding>`;
}

const BINDINGS_PATH = '/sap/bc/adt/businessservices/bindings';
const isBindingRead = (req: RecordedRequest) => req.method === 'GET' && req.path.startsWith(`${BINDINGS_PATH}/`);

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

/** Full happy-path responder covering every endpoint in the lifecycle; the binding does not exist yet. */
function lifecycleResponder(): Responder {
    return (req) => {
        const p = req.path;
        if (isBindingRead(req)) return new Response('', { status: 404 });
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

describe('unlock failure after a binding job', () => {
    const BINDING_PATH = '/sap/bc/adt/businessservices/bindings/zb_api_v2';
    const DUMP_PAGE = '<html><head><title>Application Server Error</title></head><body>500 Internal Server Error</body></html>';

    function bindingXml(published: boolean): string {
        return bindingDocument({ name: 'ZB_API_V2', published, version: 'V2' });
    }

    // The orchestration reads the binding first (absent), then again to confirm a failed publish.
    function readsAfterCreate(published: boolean): Responder {
        let reads = 0;
        return (req) => {
            if (req.method === 'GET' && req.path === BINDING_PATH) {
                reads += 1;
                return reads === 1 ? new Response('', { status: 404 }) : new Response(bindingXml(published), { status: 200 });
            }
            if (req.params?.['_action'] === 'UNLOCK') return new Response(DUMP_PAGE, { status: 500 });
            return lifecycleResponder()(req);
        };
    }

    // Every UNLOCK in sequence answers with the next status; GET returns the binding with the given publish state.
    function unlockResponder(unlockStatuses: number[], published: boolean, jobText = 'published locally'): Responder {
        const statuses = [...unlockStatuses];
        return (req) => {
            if (req.params?.['_action'] === 'LOCK') return new Response(lockXml('HANDLE123'), { status: 200 });
            if (req.params?.['_action'] === 'UNLOCK') {
                const status = statuses.shift() ?? 200;
                return new Response(status === 200 ? '' : DUMP_PAGE, { status });
            }
            if (req.method === 'GET') return new Response(bindingXml(published), { status: 200 });
            return new Response(severityXml('OK', jobText), { status: 200 });
        };
    }

    const unlocks = (calls: RecordedRequest[]) => calls.filter(c => c.params?.['_action'] === 'UNLOCK');
    const reads = (calls: RecordedRequest[]) => calls.filter(c => c.method === 'GET');

    it('succeeds when the unlock retry releases the lock, without reading the publish state', async () => {
        const { requestor, calls } = mockRequestor(unlockResponder([500, 200], false));

        const [message, error] = await publishServiceBinding(requestor, 'ZB_API_V2', 'V2');

        expect(error).toBeNull();
        expect(message).toBe('published locally');
        expect(unlocks(calls)).toHaveLength(2);
        expect(unlocks(calls)[1]!.params).toMatchObject({ lockHandle: 'HANDLE123' });
        expect(reads(calls)).toHaveLength(0);
    });

    it('succeeds when both unlocks fail but the binding shows as published', async () => {
        const { requestor, calls } = mockRequestor(unlockResponder([500, 400], true));

        const [message, error] = await publishServiceBinding(requestor, 'ZB_API_V2', 'V2');

        expect(error).toBeNull();
        expect(message).toBe('published locally');
        expect(unlocks(calls)).toHaveLength(2);
        expect(reads(calls)).toHaveLength(1);
        expect(reads(calls)[0]!.path).toBe('/sap/bc/adt/businessservices/bindings/zb_api_v2');
    });

    it('fails with the unlock error when the binding is not published after all', async () => {
        const { requestor } = mockRequestor(unlockResponder([500, 500], false));

        const [message, error] = await publishServiceBinding(requestor, 'ZB_API_V2', 'V2');

        expect(message).toBeNull();
        expect(error?.message).toContain('Failed to unlock service binding ZB_API_V2');
    });

    it('fails with the unlock error when the publish state cannot be read', async () => {
        const { requestor } = mockRequestor((req) => {
            if (req.params?.['_action'] === 'LOCK') return new Response(lockXml('HANDLE123'), { status: 200 });
            if (req.params?.['_action'] === 'UNLOCK') return new Response(DUMP_PAGE, { status: 500 });
            if (req.method === 'GET') return new Response(DUMP_PAGE, { status: 500 });
            return new Response(severityXml('OK', 'published locally'), { status: 200 });
        });

        const [, error] = await publishServiceBinding(requestor, 'ZB_API_V2', 'V2');

        expect(error?.message).toContain('Failed to unlock service binding ZB_API_V2');
    });

    it('confirms an unpublish by an unpublished state', async () => {
        const { requestor } = mockRequestor(unlockResponder([500, 500], false, 'un-published locally'));

        const [message, error] = await unpublishServiceBinding(requestor, 'ZB_API_V2', 'V2');

        expect(error).toBeNull();
        expect(message).toBe('un-published locally');
    });

    it('reports a failed job, not the unlock, and does not read the publish state', async () => {
        const { requestor, calls } = mockRequestor((req) => {
            if (req.params?.['_action'] === 'LOCK') return new Response(lockXml('HANDLE123'), { status: 200 });
            if (req.params?.['_action'] === 'UNLOCK') return new Response(DUMP_PAGE, { status: 500 });
            if (req.method === 'GET') return new Response(bindingXml(true), { status: 200 });
            return new Response(severityXml('ERROR', 'no service registered'), { status: 200 });
        });

        const [, error] = await publishServiceBinding(requestor, 'ZB_API_V2', 'V2');

        expect(error?.message).toContain('no service registered');
        expect(reads(calls)).toHaveLength(0);
    });

    it('fails the orchestration when the publish cannot be confirmed', async () => {
        const { requestor } = mockRequestor(readsAfterCreate(false));

        const [result, error] = await createServiceBinding(STATE, requestor, { ...BASE_OPTIONS, bindingName: 'ZB_API_V2', bindingVersion: 'V2' });

        expect(result).toBeNull();
        expect(error?.message).toContain('Failed to unlock service binding ZB_API_V2');
        expect(error?.message).toContain('NOT published');
    });

    it('reports the orchestration as published when the publish is confirmed', async () => {
        const { requestor } = mockRequestor(readsAfterCreate(true));

        const [result, error] = await createServiceBinding(STATE, requestor, { ...BASE_OPTIONS, bindingName: 'ZB_API_V2', bindingVersion: 'V2' });

        expect(error).toBeNull();
        expect(result?.published).toBe(true);
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
            if (isBindingRead(req)) return new Response('', { status: 404 });
            if (req.path.endsWith('/validation')) return new Response(severityXml('ERROR', 'bad'), { status: 200 });
            return new Response('', { status: 201 });
        });

        const [result, error] = await createServiceBinding(STATE, requestor, BASE_OPTIONS);

        expect(result).toBeNull();
        expect(error).not.toBeNull();
        expect(calls).toHaveLength(2);
        expect(calls[1]!.path).toBe('/sap/bc/adt/businessservices/bindings/validation');
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

    it('names a V2 service after the binding, still backed by the service definition', async () => {
        const { requestor, calls } = mockRequestor(() => new Response('', { status: 201 }));

        const [, error] = await createServiceBindingObject(requestor, { ...V2_OPTIONS, bindingName: 'zb_api_v2' }, 'ebosch');

        expect(error).toBeNull();
        expect(calls[0]!.body).toContain('srvb:services srvb:name="ZB_API_V2"');
        expect(calls[0]!.body).not.toContain('srvb:services srvb:name="ZB_API"');
        expect(calls[0]!.body).toContain('<srvb:serviceDefinition adtcore:name="ZB_API"/>');
    });

    it('keeps a V4 service named after the service definition', async () => {
        const { requestor, calls } = mockRequestor(() => new Response('', { status: 201 }));

        const [, error] = await createServiceBindingObject(requestor, { ...BASE_OPTIONS, bindingVersion: 'V4' }, 'ebosch');

        expect(error).toBeNull();
        expect(calls[0]!.body).toContain('srvb:services srvb:name="ZB_API"');
        expect(calls[0]!.body).not.toContain('srvb:services srvb:name="ZB_O5"');
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

    it('passes the V2 binding name in the create body during the orchestration', async () => {
        const { requestor, calls } = mockRequestor(lifecycleResponder());

        const [, error] = await createServiceBinding(STATE, requestor, V2_OPTIONS);

        expect(error).toBeNull();
        const create = calls.find(c => c.path === '/sap/bc/adt/businessservices/bindings' && c.method === 'POST')!;
        expect(create.body).toContain('srvb:services srvb:name="ZB_API_V2"');
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

describe('validation severities', () => {
    it('passes INFO and returns its text as a note', async () => {
        const text = 'oData V4 services with no draft capability will be primarily READ-ONLY';
        const { requestor } = mockRequestor(() => new Response(severityXml('INFO', text), { status: 200 }));

        const [notes, error] = await validateServiceBinding(requestor, BASE_OPTIONS);

        expect(error).toBeNull();
        expect(notes).toEqual([`INFO: ${text}`]);
    });

    it('fails on WARNING unless warnings are allowed', async () => {
        const { requestor } = mockRequestor(() => new Response(severityXml('WARNING', 'careful'), { status: 200 }));

        const [, blocked] = await validateServiceBinding(requestor, BASE_OPTIONS);
        const [notes, allowed] = await validateServiceBinding(requestor, { ...BASE_OPTIONS, allowWarnings: true });

        expect(blocked?.message).toContain('(WARNING): careful');
        expect(allowed).toBeNull();
        expect(notes).toEqual(['WARNING: careful']);
    });

    it('returns no notes on OK', async () => {
        const { requestor } = mockRequestor(() => new Response(severityXml('OK'), { status: 200 }));

        const [notes, error] = await validateServiceBinding(requestor, BASE_OPTIONS);

        expect(error).toBeNull();
        expect(notes).toEqual([]);
    });
});

describe('binding category', () => {
    it('creates a UI binding as category 0', async () => {
        const { requestor, calls } = mockRequestor(() => new Response('', { status: 201 }));

        const [, error] = await createServiceBindingObject(requestor, { ...BASE_OPTIONS, bindingCategory: 'UI' }, 'ebosch');

        expect(error).toBeNull();
        expect(calls[0]!.body).toContain('srvb:binding srvb:category="0" srvb:type="ODATA" srvb:version="V4"');
    });

    it('keeps Web API (category 1) as the default', async () => {
        const { requestor, calls } = mockRequestor(() => new Response('', { status: 201 }));

        await createServiceBindingObject(requestor, { ...BASE_OPTIONS, bindingCategory: 'WEB_API' }, 'ebosch');
        await createServiceBindingObject(requestor, BASE_OPTIONS, 'ebosch');

        expect(calls[0]!.body).toContain('srvb:category="1"');
        expect(calls[1]!.body).toContain('srvb:category="1"');
    });
});

describe('readServiceBinding', () => {
    it('reads definition, category, publish and release state', async () => {
        const { requestor, calls } = mockRequestor(() => new Response(bindingDocument({ published: true, category: '0' }), { status: 200 }));

        const [binding, error] = await readServiceBinding(requestor, 'zb_o5');

        expect(error).toBeNull();
        expect(calls[0]!.path).toBe('/sap/bc/adt/businessservices/bindings/zb_o5');
        expect(binding).toEqual({
            name: 'ZB_O5',
            description: 'Test binding',
            packageName: 'ZBEACON',
            serviceName: 'ZB_API',
            serviceDefinition: 'ZB_API',
            serviceVersion: '0001',
            bindingType: 'ODATA',
            odataVersion: 'V4',
            category: 'UI',
            published: true,
            active: true,
            releaseState: 'NOT_RELEASED',
        });
    });

    it('returns null for a binding that does not exist', async () => {
        const { requestor } = mockRequestor(() => new Response('', { status: 404 }));

        const [binding, error] = await readServiceBinding(requestor, 'ZB_NONE');

        expect(error).toBeNull();
        expect(binding).toBeNull();
    });
});

describe('createServiceBinding (re-run on an existing binding)', () => {
    function existingResponder(document: string): Responder {
        return (req) => {
            if (isBindingRead(req)) return new Response(document, { status: 200 });
            return lifecycleResponder()(req);
        };
    }

    it('skips every step when the binding is active and published', async () => {
        const { requestor, calls } = mockRequestor(existingResponder(bindingDocument({ published: true })));

        const [result, error] = await createServiceBinding(STATE, requestor, BASE_OPTIONS);

        expect(error).toBeNull();
        expect(result?.created).toBe(false);
        expect(result?.published).toBe(true);
        expect(result?.steps).toEqual({ validate: 'SKIPPED', create: 'SKIPPED', activate: 'SKIPPED', publish: 'SKIPPED' });
        expect(calls).toHaveLength(1);
    });

    it('only publishes an active binding that is not published', async () => {
        const { requestor, calls } = mockRequestor(existingResponder(bindingDocument({ published: false })));

        const [result, error] = await createServiceBinding(STATE, requestor, BASE_OPTIONS);

        expect(error).toBeNull();
        expect(result?.steps).toEqual({ validate: 'SKIPPED', create: 'SKIPPED', activate: 'SKIPPED', publish: 'DONE' });
        expect(calls.map(c => c.path)).not.toContain('/sap/bc/adt/businessservices/bindings/validation');
        expect(calls.some(c => c.path.endsWith('/publishjobs'))).toBe(true);
    });

    it('activates an existing inactive binding', async () => {
        const { requestor } = mockRequestor(existingResponder(bindingDocument({ published: false, active: false })));

        const [result, error] = await createServiceBinding(STATE, requestor, BASE_OPTIONS);

        expect(error).toBeNull();
        expect(result?.steps.activate).toBe('DONE');
    });

    it('refuses an existing binding over a different service definition', async () => {
        const { requestor } = mockRequestor(existingResponder(bindingDocument({ definition: 'ZB_OTHER' })));

        const [result, error] = await createServiceBinding(STATE, requestor, BASE_OPTIONS);

        expect(result).toBeNull();
        expect(error?.message).toContain('already exists with service definition ZB_OTHER');
    });

    it('refuses an existing binding of the other category', async () => {
        const { requestor } = mockRequestor(existingResponder(bindingDocument({ category: '1' })));

        const [, error] = await createServiceBinding(STATE, requestor, { ...BASE_OPTIONS, bindingCategory: 'UI' });

        expect(error?.message).toContain('category WEB_API');
    });
});

describe('createServiceBinding (publish request failure)', () => {
    // First read: absent. Later reads: the binding with the given publish state. The publish job times out.
    function timeoutResponder(publishedAfter: boolean): Responder {
        let reads = 0;
        return (req) => {
            if (isBindingRead(req)) {
                reads += 1;
                return reads === 1 ? new Response('', { status: 404 }) : new Response(bindingDocument({ published: publishedAfter, category: '0' }), { status: 200 });
            }
            if (req.path.endsWith('/publishjobs')) return new Error('Request timeout');
            return lifecycleResponder()(req);
        };
    }

    it('gives the publish job a long timeout', async () => {
        const { requestor, calls } = mockRequestor(lifecycleResponder());

        await createServiceBinding(STATE, requestor, BASE_OPTIONS);

        expect(calls.find(c => c.path.endsWith('/publishjobs'))?.timeout).toBe(300_000);
    });

    it('reports success with a note when the binding reads back as published', async () => {
        const { requestor } = mockRequestor(timeoutResponder(true));

        const [result, error] = await createServiceBinding(STATE, requestor, { ...BASE_OPTIONS, bindingCategory: 'UI' });

        expect(error).toBeNull();
        expect(result?.published).toBe(true);
        expect(result?.steps.publish).toBe('DONE');
        expect(result?.notes.some(note => note.includes('Request timeout') && note.includes('reads back as published'))).toBe(true);
    });

    it('fails with the true state when the binding is not published', async () => {
        const { requestor } = mockRequestor(timeoutResponder(false));

        const [result, error] = await createServiceBinding(STATE, requestor, { ...BASE_OPTIONS, bindingCategory: 'UI' });

        expect(result).toBeNull();
        expect(error?.message).toContain('Request timeout');
        expect(error?.message).toContain('exists and is active but is NOT published');
    });

    it('carries a validation INFO through to the result notes', async () => {
        const { requestor } = mockRequestor((req) => {
            if (req.path.endsWith('/validation')) return new Response(severityXml('INFO', 'primarily READ-ONLY'), { status: 200 });
            return lifecycleResponder()(req);
        });

        const [result, error] = await createServiceBinding(STATE, requestor, BASE_OPTIONS);

        expect(error).toBeNull();
        expect(result?.notes).toEqual(['INFO: primarily READ-ONLY']);
        expect(result?.steps).toEqual({ validate: 'DONE', create: 'DONE', activate: 'DONE', publish: 'DONE' });
    });
});
