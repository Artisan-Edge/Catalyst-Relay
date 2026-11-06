/**
 * Core HTTP request with CSRF handling
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { AsyncResult } from '../../../types/result';
import type { ClientState, RequestOptions, SsoCerts } from '../../types';
import { ok, err } from '../../../types/result';
import {
    CSRF_TOKEN_HEADER,
    BASE_HEADERS,
    DEFAULT_TIMEOUT,
    buildRequestHeaders,
    debug,
    debugError,
} from '../../../core/utils';
import * as sessionOps from '../../../core/session';
import { httpRequest, buildParams, buildUrl } from '../../helpers';

export interface RequestDependencies {
    state: ClientState;
    ssoCerts: SsoCerts | undefined;
    getCookieHeader: () => string | null;
    storeCookies: (response: Response, skip?: (name: string) => boolean) => void;
}

type RequestFn = (options: RequestOptions) => AsyncResult<Response, Error>;

// Recovery (CSRF refresh, session reset) runs once per client at a time. Concurrent requests that
// hit the same expiry share it: a second session reset's logoff would kill the session the first
// one just established, along with any locks taken on it.
const csrfRefreshes = new WeakMap<ClientState, AsyncResult<string, Error>>();
const sessionResets = new WeakMap<ClientState, AsyncResult<void, Error>>();

// Marks the requests a recovery itself makes, so they never start a recovery of their own (a reset's
// logoff against a dead session answers 500, which would otherwise wait on the reset it belongs to)
const recovering = new AsyncLocalStorage<true>();

// Marks the one retry of a request the ICM rejected for a lost session context
const retryingLostContext = new AsyncLocalStorage<true>();

// The ICM answers a request on a session context that no longer exists (timed out, ended by
// another logoff or `session drop`) with HTTP 400 and this error id, before ABAP runs anything
const ICM_NO_SESSION = 'ICMENOSESSION';
const ICM_ERROR_HEADERS = ['sap-err-id', 'x-sap-icm-err-id'];
const BAD_REQUEST = 400;
const CONTEXT_COOKIE = /^sap-contextid$/i;
// Least time worth a retry inside one request; less fails clearly instead of a spurious timeout
const MIN_RETRY_MS = 1000;
const isContextCookie = (name: string): boolean => CONTEXT_COOKIE.test(name);
export const SESSION_LOST_MESSAGE = `SAP session expired (${ICM_NO_SESSION}: the server no longer knows this session) and could not be re-established: log in again`;

function isLostContext(response: Response, body: string): boolean {
    if (response.status !== BAD_REQUEST) return false;
    return ICM_ERROR_HEADERS.some(name => response.headers.get(name) === ICM_NO_SESSION) || body.includes(ICM_NO_SESSION);
}

const SESSION_TYPE_HEADER = /^x-sap-adt-sessiontype$/i;
const STATELESS = 'stateless';

function isStatelessRequest(headers: Record<string, string>): boolean {
    return Object.entries(headers).some(([name, value]) => SESSION_TYPE_HEADER.test(name) && value.toLowerCase() === STATELESS);
}

// A stateless request sent on the stateful context ends that context (and every lock it holds).
// Without the context cookie it runs in a short-lived context of its own: it sees none of the
// stateful context's buffers and SAP releases what it enqueued when the request ends.
function cookiesFor(cookieHeader: string | null, stateless: boolean): string | null {
    if (!cookieHeader || !stateless) return cookieHeader;
    const kept = cookieHeader.split(/;\s*/).filter(pair => !CONTEXT_COOKIE.test(pair.split('=')[0] ?? ''));
    return kept.length > 0 ? kept.join('; ') : null;
}

function shareRecovery<T>(inFlight: WeakMap<ClientState, AsyncResult<T, Error>>, state: ClientState, start: () => AsyncResult<T, Error>): AsyncResult<T, Error> {
    const existing = inFlight.get(state);
    if (existing) return existing;

    const recovery = recovering.run(true, start).finally(() => inFlight.delete(state));
    inFlight.set(state, recovery);
    return recovery;
}

// The two recoveries never overlap: each would set its own session cookie and token, and the
// client could end up holding a cookie from one and a token from the other
async function refreshCsrfToken(state: ClientState, sentToken: string | null, selfRequest: RequestFn): AsyncResult<string, Error> {
    // A reset in flight fetches a fresh token as part of its login; use that one
    const reset = sessionResets.get(state);
    if (reset) await reset;

    // Another request already replaced the token this one was sent with
    if (state.csrfToken && state.csrfToken !== sentToken) return ok(state.csrfToken);
    return shareRecovery(csrfRefreshes, state, () => sessionOps.fetchCsrfToken(state, selfRequest));
}

async function resetSession(state: ClientState, sentSession: ClientState['session'], selfRequest: RequestFn): AsyncResult<void, Error> {
    const refresh = csrfRefreshes.get(state);
    if (refresh) await refresh;

    // Another request already replaced the session this one was sent on
    if (state.session && state.session !== sentSession) return ok(undefined);
    return shareRecovery(sessionResets, state, () => sessionOps.sessionReset(state, selfRequest));
}

/**
 * Execute HTTP request with CSRF token injection and automatic retry on 403 errors
 */
export async function executeRequest(
    deps: RequestDependencies,
    options: RequestOptions,
    selfRequest: RequestFn
): AsyncResult<Response, Error> {
    const { state, ssoCerts, getCookieHeader, storeCookies } = deps;
    const { method, path, params, headers: customHeaders, body, timeout: requestTimeout } = options;
    const { config } = state;
    const isRecoveryRequest = recovering.getStore() === true;
    const sentCsrfToken = state.csrfToken;
    const sentSession = state.session;
    // A retry inside this request (CSRF refresh, lost context) gets the time left, not a fresh timeout
    const timeout = requestTimeout ?? config.timeout ?? DEFAULT_TIMEOUT;
    const startedAt = Date.now();
    const timeLeft = (): number => timeout - (Date.now() - startedAt);
    const noTimeToRetry = (why: string): Error => new Error(`No time left to retry ${method} ${path} after ${why} (the ${timeout} ms timeout is used up)`);

    // Build headers with auth and CSRF token
    debug(`Request ${method} ${path} - CSRF token in state: ${state.csrfToken?.substring(0, 20) || 'null'}...`);
    const headers = buildRequestHeaders(
        BASE_HEADERS,
        customHeaders,
        config.auth,
        state.csrfToken
    );
    debug(`CSRF header being sent: ${headers['x-csrf-token']?.substring(0, 20) || 'none'}...`);

    // Add stored cookies to request
    const stateless = isStatelessRequest(headers);
    const cookieHeader = cookiesFor(getCookieHeader(), stateless);
    if (cookieHeader) {
        headers['Cookie'] = cookieHeader;
        debug(`Cookies being sent: ${cookieHeader.substring(0, 50)}...`);
    }

    // Build URL with parameters
    const urlParams = buildParams(params, config.client);
    const url = buildUrl(config.url, path, urlParams);

    try {
        // Execute HTTP request using Node.js https module
        debug(`Fetching URL: ${url}`);
        debug(`mTLS: ${!!ssoCerts}, insecure: ${config.insecure}`);

        const response = await httpRequest(url, {
            method,
            headers,
            body,
            cert: ssoCerts?.cert,
            key: ssoCerts?.key,
            rejectUnauthorized: !config.insecure,
            timeout,
        });


        // Store any cookies from response; a stateless one must not replace the stateful context cookie
        const keepCookies = (received: Response): void => stateless ? storeCookies(received, isContextCookie) : storeCookies(received);
        keepCookies(response);

        // Handle CSRF token validation failure with automatic refresh
        if (response.status === 403) {
            const text = await response.text();
            if (text.includes('CSRF token validation failed') && !isRecoveryRequest) {
                // Fetch new CSRF token
                const [newToken, tokenErr] = await refreshCsrfToken(state, sentCsrfToken, selfRequest);
                if (tokenErr) {
                    return err(new Error(`CSRF token refresh failed: ${tokenErr.message}`));
                }

                // Retry request with new token and cookies
                headers[CSRF_TOKEN_HEADER] = newToken;
                const retryCookieHeader = cookiesFor(getCookieHeader(), stateless);
                if (retryCookieHeader) {
                    headers['Cookie'] = retryCookieHeader;
                }
                debug(`Retrying with new CSRF token: ${newToken.substring(0, 20)}...`);
                const retryTimeout = timeLeft();
                if (retryTimeout < MIN_RETRY_MS) return err(noTimeToRetry('a CSRF token refresh'));

                const retryResponse = await httpRequest(url, {
                    method,
                    headers,
                    body,
                    cert: ssoCerts?.cert,
                    key: ssoCerts?.key,
                    rejectUnauthorized: !config.insecure,
                    timeout: retryTimeout,
                });
                keepCookies(retryResponse);
                return ok(retryResponse);
            }

            // Return 403 response if not CSRF-related
            return ok(new Response(text, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
            }));
        }

        // Lost session context: nothing ran, so retry once on a fresh context (locks of the old one are gone)
        if (response.status === BAD_REQUEST) {
            const text = await response.text();
            // A stateless request sends no context cookie, so it cannot have lost one: the stateful context
            // (and its locks) stays, and the 400 goes to the caller
            if (stateless || !isLostContext(response, text)) {
                return ok(new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers }));
            }
            if (isRecoveryRequest || retryingLostContext.getStore() === true) return err(new Error(SESSION_LOST_MESSAGE));

            debug(`${ICM_NO_SESSION} on ${method} ${path}: retrying on a new session context`);
            for (const name of [...state.cookies.keys()]) {
                if (CONTEXT_COOKIE.test(name)) state.cookies.delete(name);
            }
            const retryTimeout = timeLeft();
            if (retryTimeout < MIN_RETRY_MS) return err(noTimeToRetry('a lost session context'));
            return retryingLostContext.run(true, () => selfRequest({ ...options, timeout: retryTimeout }));
        }

        // Handle session expiration with automatic reset
        if (response.status === 500) {
            const text = await response.text();

            // Application errors also surface as 500 — only reset when the body
            // actually indicates a dead session. SAML sessions are excluded: the
            // reset's logoff would destroy browser-established cookies that
            // cannot be re-acquired headlessly. Stateless requests are excluded too:
            // their 500 (a class run or generator dump page) says nothing about the
            // stateful session, and a reset would end it and its locks.
            const isSessionError = /session/i.test(text) && /(timed out|expired|no longer exists|not found)/i.test(text);
            if (isSessionError && !stateless && config.auth.type !== 'saml' && !isRecoveryRequest) {
                const [, resetErr] = await resetSession(state, sentSession, selfRequest);
                if (resetErr) {
                    debugError(`Session reset after 500 failed: ${resetErr.message}`);
                }
            }

            // Return original 500 response
            return ok(new Response(text, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
            }));
        }

        return ok(response);
    } catch (error) {
        // Log detailed error info for debugging
        if (error instanceof Error) {
            debugError(`Fetch error: ${error.name}: ${error.message}`, error.cause);
            if ('code' in error) {
                debugError(`Error code: ${(error as NodeJS.ErrnoException).code}`);
            }
            return err(error);
        }
        return err(new Error(`Network error: ${String(error)}`));
    }
}
