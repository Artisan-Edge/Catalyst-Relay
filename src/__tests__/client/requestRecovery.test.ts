/**
 * Unit Tests for shared request recovery
 *
 * Concurrent requests that hit an expired CSRF token or a dead session must share one recovery
 * instead of each running their own. A request the ICM rejects for a lost session context
 * (ICMENOSESSION) is retried once on a fresh context. Runs executeRequest against a local stand-in for SAP.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { executeRequest, SESSION_LOST_MESSAGE, type RequestDependencies } from '../../client/methods/internal/request';
import type { ClientState, RequestOptions } from '../../client/types';

// =============================================================================
// Stand-in SAP server
// =============================================================================

const SESSION_TIMED_OUT = 'Session timed out';

const server = {
    csrfFetches: 0,
    logoffs: 0,
    validToken: 'initial',
    sessionExpired: false,
    logoffAnswersDeadSession: false,
    // Recovery requests (CSRF fetch, logoff) in flight right now, and the most seen at once
    recoveryInFlight: 0,
    peakRecovery: 0,
    // Requests to '/context' the ICM still rejects with ICMENOSESSION, and the context cookies they carried
    lostContextAnswers: 0,
    contextCalls: [] as (string | null)[],
};

const ICM_NO_SESSION_PAGE = '<!-- Error code: ICMENOSESSION --><html><head><title>Application Server Error</title></head><body>400 Session Timed Out</body></html>';

async function asRecovery(handle: () => Promise<Response>): Promise<Response> {
    server.recoveryInFlight++;
    server.peakRecovery = Math.max(server.peakRecovery, server.recoveryInFlight);
    try {
        return await handle();
    } finally {
        server.recoveryInFlight--;
    }
}

let instance: ReturnType<typeof Bun.serve>;

beforeAll(() => {
    instance = Bun.serve({
        port: 0,
        async fetch(req) {
            const path = new URL(req.url).pathname;

            // CSRF fetch: issue a new token; a re-login also revives the session
            if (path === '/sap/bc/adt/compatibility/graph') {
                return asRecovery(async () => {
                    server.csrfFetches++;
                    server.validToken = `token-${server.csrfFetches}`;
                    server.sessionExpired = false;
                    await Bun.sleep(20);
                    return new Response('', { headers: { 'x-csrf-token': server.validToken } });
                });
            }

            if (path === '/sap/public/bc/icf/logoff') {
                return asRecovery(async () => {
                    server.logoffs++;
                    await Bun.sleep(10);
                    if (server.logoffAnswersDeadSession) return new Response(SESSION_TIMED_OUT, { status: 500 });
                    return new Response('');
                });
            }

            // '/context' stands for work on a stateful session context the server no longer has
            if (path === '/context') {
                server.contextCalls.push(req.headers.get('cookie'));
                if (server.lostContextAnswers > 0) {
                    server.lostContextAnswers--;
                    return new Response(ICM_NO_SESSION_PAGE, { status: 400, headers: { 'content-type': 'text/html', 'sap-err-id': 'ICMENOSESSION' } });
                }
                return new Response('done');
            }

            if (path === '/bad-request') return new Response('Invalid parameter', { status: 400 });

            // '/expire' stands for work on a session that has timed out; '/work' only checks the token
            if (path === '/expire' && server.sessionExpired) return new Response(SESSION_TIMED_OUT, { status: 500 });
            if (req.headers.get('x-csrf-token') !== server.validToken) return new Response('CSRF token validation failed', { status: 403 });
            return new Response('done');
        },
    });
});

afterAll(() => {
    instance.stop(true);
});

// =============================================================================
// Test Helpers
// =============================================================================

function createClient(csrfToken: string): { state: ClientState; request: (options: RequestOptions) => ReturnType<typeof executeRequest> } {
    // Only the fields executeRequest and the session operations read
    const state = {
        config: {
            url: `http://localhost:${instance.port}`,
            client: '100',
            auth: { type: 'basic', username: 'TESTUSER', password: 'testpass' },
        },
        session: { sessionId: 'original', username: 'TESTUSER', expiresAt: Date.now() + 3_600_000 },
        csrfToken,
        cookies: new Map<string, string>(),
    } as unknown as ClientState;

    const deps: RequestDependencies = {
        state,
        ssoCerts: undefined,
        getCookieHeader: () => [...state.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ') || null,
        storeCookies: () => undefined,
    };
    const request = (options: RequestOptions): ReturnType<typeof executeRequest> => executeRequest(deps, options, request);
    return { state, request };
}

beforeEach(() => {
    server.csrfFetches = 0;
    server.logoffs = 0;
    server.validToken = 'initial';
    server.sessionExpired = false;
    server.logoffAnswersDeadSession = false;
    server.recoveryInFlight = 0;
    server.peakRecovery = 0;
    server.lostContextAnswers = 0;
    server.contextCalls = [];
});

// =============================================================================
// Tests
// =============================================================================

describe('executeRequest recovery', () => {
    it('shares one CSRF refresh between concurrent requests rejected for a stale token', async () => {
        const { state, request } = createClient('stale');

        const results = await Promise.all(Array.from({ length: 10 }, () => request({ method: 'POST', path: '/work' })));

        expect(server.csrfFetches).toBe(1);
        expect(results.map(([response]) => response?.status)).toEqual(Array(10).fill(200));
        expect(state.csrfToken).toBe('token-1');
    });

    it('reuses a token another request already refreshed instead of fetching again', async () => {
        const { request } = createClient('stale');

        await request({ method: 'POST', path: '/work' });
        expect(server.csrfFetches).toBe(1);

        // Server rotates the token behind this client's back; the next 403 needs exactly one more fetch
        server.validToken = 'rotated';
        const results = await Promise.all(Array.from({ length: 5 }, () => request({ method: 'POST', path: '/work' })));

        expect(server.csrfFetches).toBe(2);
        expect(results.every(([response]) => response?.status === 200)).toBe(true);
    });

    it('shares one session reset between concurrent requests that find the session dead', async () => {
        const { state, request } = createClient('initial');
        server.sessionExpired = true;

        await Promise.all(Array.from({ length: 10 }, () => request({ method: 'POST', path: '/expire' })));

        expect(server.logoffs).toBe(1);
        expect(server.csrfFetches).toBe(1);
        expect(state.session?.sessionId).toBe('token-1');
    });

    it('does not reset again from inside a reset when the logoff itself reports a dead session', async () => {
        const { state, request } = createClient('initial');
        server.sessionExpired = true;
        server.logoffAnswersDeadSession = true;

        const [response] = await request({ method: 'POST', path: '/expire' });

        expect(response?.status).toBe(500);
        expect(server.logoffs).toBe(1);
        expect(state.session?.sessionId).toBe('token-1');
    });

    it('never runs a CSRF refresh alongside a session reset', async () => {
        const { state, request } = createClient('stale');
        server.sessionExpired = true;

        // Dead-session work and stale-token work hit the client at the same time
        const results = await Promise.all(Array.from({ length: 10 }, (_, i) => request({ method: 'POST', path: i % 2 === 0 ? '/expire' : '/work' })));

        expect(server.peakRecovery).toBe(1);
        expect(server.logoffs).toBe(1);
        expect(state.csrfToken).toBe(server.validToken);
        expect(results.filter((_, i) => i % 2 === 1).every(([response]) => response?.status === 200)).toBe(true);
    });
});

describe('executeRequest lost session context (ICMENOSESSION)', () => {
    it('retries once on a fresh context, without the dead context cookie', async () => {
        // The regression: the ICM's HTML 400 surfaced as an unknown error (CLI exit 99)
        const { state, request } = createClient('initial');
        state.cookies.set('sap-contextid', 'SID:dead');
        state.cookies.set('SAP_SESSIONID_X_100', 'keep');
        server.lostContextAnswers = 1;

        const [response, error] = await request({ method: 'GET', path: '/context' });

        expect(error).toBeNull();
        expect(response?.status).toBe(200);
        expect(server.contextCalls).toHaveLength(2);
        expect(server.contextCalls[0]).toContain('sap-contextid=SID:dead');
        expect(server.contextCalls[1]).not.toContain('sap-contextid');
        expect(server.contextCalls[1]).toContain('SAP_SESSIONID_X_100=keep');
    });

    it('reports an expired session when the retry is rejected too', async () => {
        const { request } = createClient('initial');
        server.lostContextAnswers = 5;

        const [response, error] = await request({ method: 'POST', path: '/context' });

        expect(response).toBeNull();
        expect(error?.message).toBe(SESSION_LOST_MESSAGE);
        expect(error?.message).toContain('session expired');
        expect(server.contextCalls).toHaveLength(2);
    });

    it('passes any other 400 through untouched', async () => {
        const { request } = createClient('initial');

        const [response] = await request({ method: 'GET', path: '/bad-request' });

        expect(response?.status).toBe(400);
        expect(await response?.text()).toBe('Invalid parameter');
    });
});
