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
    storeCookies: (response: Response) => void;
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
    const cookieHeader = getCookieHeader();
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
            timeout: requestTimeout ?? config.timeout ?? DEFAULT_TIMEOUT,
        });


        // Store any cookies from response
        storeCookies(response);

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
                const retryCookieHeader = getCookieHeader();
                if (retryCookieHeader) {
                    headers['Cookie'] = retryCookieHeader;
                }
                debug(`Retrying with new CSRF token: ${newToken.substring(0, 20)}...`);

                const retryResponse = await httpRequest(url, {
                    method,
                    headers,
                    body,
                    cert: ssoCerts?.cert,
                    key: ssoCerts?.key,
                    rejectUnauthorized: !config.insecure,
                    timeout: requestTimeout ?? config.timeout ?? DEFAULT_TIMEOUT,
                });
                storeCookies(retryResponse);
                return ok(retryResponse);
            }

            // Return 403 response if not CSRF-related
            return ok(new Response(text, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
            }));
        }

        // Handle session expiration with automatic reset
        if (response.status === 500) {
            const text = await response.text();

            // Application errors also surface as 500 — only reset when the body
            // actually indicates a dead session. SAML sessions are excluded: the
            // reset's logoff would destroy browser-established cookies that
            // cannot be re-acquired headlessly.
            const isSessionError = /session/i.test(text) && /(timed out|expired|no longer exists|not found)/i.test(text);
            if (isSessionError && config.auth.type !== 'saml' && !isRecoveryRequest) {
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
