/**
 * Unit Tests for stateless requests
 *
 * A stateless request sent on the stateful context would end that context and its locks, so
 * executeRequest sends it without the sap-contextid cookie (other cookies stay). Runs against a
 * local stand-in for SAP that records the cookies it receives.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { executeRequest, type RequestDependencies } from '../../client/methods/internal/request';
import { storeCookies } from '../../client/methods/internal/cookies';
import type { ClientState, RequestOptions } from '../../client/types';

const received: { cookie: string | null; sessionType: string | null }[] = [];
const paths: string[] = [];
let instance: ReturnType<typeof Bun.serve>;

// A dump page that the session-reset heuristic would read as a dead session
const DUMP_PAGE = '<html><body>500 Internal Server Error: Session object not found in CL_OO_ADT_RES_CLASSRUN</body></html>';

beforeAll(() => {
    instance = Bun.serve({
        port: 0,
        fetch(req) {
            const path = new URL(req.url).pathname;
            paths.push(path);
            received.push({ cookie: req.headers.get('cookie'), sessionType: req.headers.get('x-sap-adt-sessiontype') });
            if (path === '/dump') return new Response(DUMP_PAGE, { status: 500 });
            if (path === '/sets-context') return new Response('done', { headers: [['set-cookie', 'sap-contextid=SID%3aNEW; path=/'], ['set-cookie', 'MYSAPSSO2=fresh; path=/']] });
            if (path === '/sap/bc/adt/compatibility/graph') return new Response('', { headers: { 'x-csrf-token': 'token' } });
            return new Response('done');
        },
    });
});

afterAll(() => {
    instance.stop(true);
});

beforeEach(() => {
    received.length = 0;
    paths.length = 0;
});

function createRequest(cookies: Record<string, string>, cookieJar?: Map<string, string>): (options: RequestOptions) => ReturnType<typeof executeRequest> {
    const state = {
        config: { url: `http://localhost:${instance.port}`, client: '100', auth: { type: 'basic', username: 'U', password: 'P' } },
        session: { sessionId: 'S', username: 'U', expiresAt: Date.now() + 3_600_000 },
        csrfToken: 'token',
        cookies: cookieJar ?? new Map(Object.entries(cookies)),
    } as unknown as ClientState;
    const deps: RequestDependencies = {
        state,
        ssoCerts: undefined,
        getCookieHeader: () => [...state.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ') || null,
        storeCookies: (response, skip) => storeCookies(state.cookies, response, skip),
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

    it('never reset the session on a 500 whose page mentions a session (e.g. a dump)', async () => {
        const request = createRequest(COOKIES);

        const [response] = await request({ method: 'POST', path: '/dump', headers: { 'X-sap-adt-sessiontype': 'stateless' } });

        expect(response!.status).toBe(500);
        expect(paths).toEqual(['/dump']);
    });

    it('a stateful 500 like that still resets the session (control)', async () => {
        const request = createRequest(COOKIES);

        await request({ method: 'POST', path: '/dump' });

        expect(paths).toContain('/sap/public/bc/icf/logoff');
    });

    it('keep the stored context cookie when a stateless response sets one; other cookies are stored', async () => {
        const jar = new Map(Object.entries(COOKIES));
        const request = createRequest(COOKIES, jar);

        await request({ method: 'POST', path: '/sets-context', headers: { 'X-sap-adt-sessiontype': 'stateless' } });

        expect(jar.get('sap-contextid')).toBe('SID%3aCTX');
        expect(jar.get('MYSAPSSO2')).toBe('fresh');
    });

    it('a stateful response replaces the context cookie (control)', async () => {
        const jar = new Map(Object.entries(COOKIES));
        const request = createRequest(COOKIES, jar);

        await request({ method: 'POST', path: '/sets-context' });

        expect(jar.get('sap-contextid')).toBe('SID%3aNEW');
    });

    it('do not change stateful requests', async () => {
        const request = createRequest(COOKIES);
        await request({ method: 'POST', path: '/lock' });

        expect(received[0]).toEqual({ cookie: 'sap-contextid=SID%3aCTX; SAP_SESSIONID_ABC_100=secure', sessionType: 'stateful' });
    });
});
