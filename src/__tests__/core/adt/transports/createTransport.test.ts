/**
 * Unit Tests for createTransport — target resolution and the public cloud LOCAL retry
 */

import { describe, it, expect } from 'bun:test';
import { createTransport } from '../../../../core/adt/transports/createTransport';
import type { AdtRequestor } from '../../../../core/adt';

interface RecordedRequest {
    method: string;
    path: string;
    body?: string;
}

function mockRequestor(responder: (req: RecordedRequest) => Response): { requestor: AdtRequestor; calls: RecordedRequest[] } {
    const calls: RecordedRequest[] = [];
    const requestor: AdtRequestor = {
        request: async (options) => {
            const call: RecordedRequest = { method: options.method, path: options.path };
            if (options.body !== undefined) call.body = options.body;
            calls.push(call);
            return [responder(call), null];
        },
    };
    return { requestor, calls };
}

function targetsXml(names: string[]): string {
    const items = names.map(name => `<nameditem:namedItem><nameditem:name>${name}</nameditem:name><nameditem:description>${name} target</nameditem:description></nameditem:namedItem>`).join('');
    return `<?xml version="1.0" encoding="utf-8"?><nameditem:namedItemList xmlns:nameditem="http://www.sap.com/adt/nameditem">${items}</nameditem:namedItemList>`;
}

function createdXml(number: string): string {
    return `<?xml version="1.0" encoding="utf-8"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm"><tm:request tm:number="${number}"/></tm:root>`;
}

const REFUSED = '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework"><message lang="EN">Creation of requests of type DEV is not allowed.</message><localizedMessage lang="EN">Creation of requests of type DEV is not allowed.</localizedMessage></exc:exception>';

// Answers the target value help with the given targets; refuses every create whose target is not LOCAL.
function publicCloudResponder(targets: string[]): (req: RecordedRequest) => Response {
    return (req) => {
        if (req.method === 'GET') return new Response(targetsXml(targets), { status: 200 });
        if (req.body?.includes('tm:target="LOCAL"')) return new Response(createdXml('ZAOK900285'), { status: 200 });
        return new Response(REFUSED, { status: 400 });
    };
}

const createBodies = (calls: RecordedRequest[]) => calls.filter(c => c.method === 'POST').map(c => c.body ?? '');

describe('createTransport', () => {
    it('creates with the single target the value help offers', async () => {
        const { requestor, calls } = mockRequestor((req) => {
            if (req.method === 'GET') return new Response(targetsXml(['DEV']), { status: 200 });
            return new Response(createdXml('DEVK900001'), { status: 200 });
        });

        const [number, error] = await createTransport(requestor, { description: 'x' }, 'EBOSCH');

        expect(error).toBeNull();
        expect(number).toBe('DEVK900001');
        expect(createBodies(calls)).toHaveLength(1);
        expect(createBodies(calls)[0]).toContain('tm:target="DEV"');
    });

    it('retries an auto-resolved target as LOCAL when the system refuses it', async () => {
        const { requestor, calls } = mockRequestor(publicCloudResponder(['DEV']));

        const [number, error] = await createTransport(requestor, { description: 'x' }, 'EBOSCH');

        expect(error).toBeNull();
        expect(number).toBe('ZAOK900285');
        const bodies = createBodies(calls);
        expect(bodies).toHaveLength(2);
        expect(bodies[0]).toContain('tm:target="DEV"');
        expect(bodies[1]).toContain('tm:target="LOCAL"');
    });

    it('does not override an explicit target, but points at LOCAL', async () => {
        const { requestor, calls } = mockRequestor(publicCloudResponder(['DEV']));

        const [number, error] = await createTransport(requestor, { description: 'x', target: 'DEV' }, 'EBOSCH');

        expect(number).toBeNull();
        expect(error?.message).toContain('Creation of requests of type DEV is not allowed');
        expect(error?.message).toContain('pass target LOCAL');
        expect(createBodies(calls)).toHaveLength(1);
    });

    it('passes other create errors through without a retry', async () => {
        const { requestor, calls } = mockRequestor((req) => {
            if (req.method === 'GET') return new Response(targetsXml(['DEV']), { status: 200 });
            return new Response('<exc:exception xmlns:exc="x"><message lang="EN">No authorization</message></exc:exception>', { status: 403 });
        });

        const [, error] = await createTransport(requestor, { description: 'x' }, 'EBOSCH');

        expect(error?.message).toContain('No authorization');
        expect(createBodies(calls)).toHaveLength(1);
    });
});
