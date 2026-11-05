/**
 * Unit Tests for stateless requests
 *
 * A stateless request sent on the stateful context would end that context and its locks, so
 * executeRequest sends it without the sap-contextid cookie (other cookies stay). Runs against a
 * local stand-in for SAP that records the cookies it receives.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { executeRequest, type RequestDependencies } from '../../client/methods/internal/request';
import type { ClientState, RequestOptions } from '../../client/types';

const received: { cookie: string | null; sessionType: string | null }[] = [];
let instance: ReturnType<typeof Bun.serve>;

beforeAll(() => {
    instance = Bun.serve({
        port: 0,
        fetch(req) {
            received.push({ cookie: req.headers.get('cookie'), sessionType: req.headers.get('x-sap-adt-sessiontype') });
            return new Response('done');
        },
    });
});

afterAll(() => {
    instance.stop(true);
});

beforeEach(() => {
    received.length = 0;
});

function createRequest(cookies: Record<string, string>): (options: RequestOptions) => ReturnType<typeof executeRequest> {
    const state = {
        config: { url: `http://localhost:${instance.port}`, client: '100', auth: { type: 'basic', username: 'U', password: 'P' } },
        session: { sessionId: 'S', username: 'U', expiresAt: Date.now() + 3_600_000 },
        csrfToken: 'token',
        cookies: new Map(Object.entries(cookies)),
    } as unknown as ClientState;
    const deps: RequestDependencies = {
        state,
        ssoCerts: undefined,
        getCookieHeader: () => [...state.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ') || null,
        storeCookies: () => undefined,
    };
    const request = (options: RequestOptions): ReturnType<typeof executeRequest> => executeRequest(deps, options, request);
    return request;
}

const COOKIES = { 'sap-contextid': 'SID%3aCTX', 'SAP_SESSIONID_ABC_100': 'secure' };

describe('stateless requests', () => {
    it('leave out the context cookie and keep the security session', async () => {
        const request = createRequest(COOKIES);
        const [response, error] = await request({ method: 'POST', path: '/create', headers: { 'X-sap-adt-sessiontype': 'stateless' } });

        expect(error).toBeNull();
        expect(response!.status).toBe(200);
        expect(received[0]).toEqual({ cookie: 'SAP_SESSIONID_ABC_100=secure', sessionType: 'stateless' });
    });

    it('send no cookie header when the context cookie is the only one', async () => {
        const request = createRequest({ 'sap-contextid': 'SID%3aCTX' });
        await request({ method: 'GET', path: '/x', headers: { 'x-sap-adt-sessiontype': 'STATELESS' } });

        expect(received[0]!.cookie).toBeNull();
    });

    it('do not change stateful requests', async () => {
        const request = createRequest(COOKIES);
        await request({ method: 'POST', path: '/lock' });

        expect(received[0]).toEqual({ cookie: 'sap-contextid=SID%3aCTX; SAP_SESSIONID_ABC_100=secure', sessionType: 'stateful' });
    });
});
