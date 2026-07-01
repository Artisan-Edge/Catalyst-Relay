/**
 * Core HTTP request with CSRF handling
 */

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

/**
 * Execute HTTP request with CSRF token injection and automatic retry on 403 errors
 */
export async function executeRequest(
    deps: RequestDependencies,
    options: RequestOptions,
    selfRequest: (options: RequestOptions) => AsyncResult<Response, Error>
): AsyncResult<Response, Error> {
    const { state, ssoCerts, getCookieHeader, storeCookies } = deps;
    const { method, path, params, headers: customHeaders, body, timeout: requestTimeout } = options;
    const { config } = state;

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
            if (text.includes('CSRF token validation failed')) {
                // Fetch new CSRF token
                const [newToken, tokenErr] = await sessionOps.fetchCsrfToken(state, selfRequest);
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
            if (isSessionError && config.auth.type !== 'saml') {
                const [, resetErr] = await sessionOps.sessionReset(state, selfRequest);
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
