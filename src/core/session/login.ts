/**
 * Session Lifecycle Operations
 *
 * Internal helpers for login/logout/session reset operations.
 * Used by ADTClient to manage session state.
 *
 * Handles:
 * - CSRF token fetching
 * - Basic authentication login flow
 * - Session reset on 500 errors
 * - Logout/cleanup
 */

import type { AuthConfig } from '../../types/config';
import type { Session } from '../../types/responses';
import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import {
    FETCH_CSRF_TOKEN,
    CSRF_TOKEN_HEADER,
    extractCsrfToken
} from '../utils';

// Request function type signature (provided by client.ts)
type RequestFn = (options: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    params?: Record<string, string | number>;
    headers?: Record<string, string>;
    body?: string;
}) => AsyncResult<Response, Error>;

// Session state management (provided by client.ts)
export interface SessionState {
    csrfToken: string | null;
    session: Session | null;
    config: { auth: AuthConfig };
}

/**
 * Fetch CSRF token from SAP ADT server
 *
 * Endpoint and content type vary by auth type:
 * - SAML: /sap/bc/adt/core/http/sessions
 * - Basic/SSO: /sap/bc/adt/compatibility/graph
 *
 * @param state - Session state to update with new token
 * @param request - HTTP request function from client
 * @returns CSRF token string or error
 */
export async function fetchCsrfToken(
    state: SessionState,
    request: RequestFn
): AsyncResult<string, Error> {
    // Select endpoint based on authentication type.
    const endpoint = state.config.auth.type === 'saml'
        ? '/sap/bc/adt/core/http/sessions'
        : '/sap/bc/adt/compatibility/graph';

    // Select content type based on authentication type.
    const contentType = state.config.auth.type === 'saml'
        ? 'application/vnd.sap.adt.core.http.session.v3+xml'
        : 'application/xml';

    // Build request headers with CSRF token fetch flag.
    const headers = {
        [CSRF_TOKEN_HEADER]: FETCH_CSRF_TOKEN,
        'Content-Type': contentType,
        'Accept': contentType,
    };

    // Execute CSRF token request.
    const [response, requestErr] = await request({
        method: 'GET',
        path: endpoint,
        headers,
    });

    if (requestErr) {
        return err(new Error(`Failed to fetch CSRF token: ${requestErr.message}`));
    }

    if (!response.ok) {
        const text = await response.text();
        return err(new Error(`CSRF token fetch failed with status ${response.status}: ${text}`));
    }

    // Extract CSRF token from response headers.
    const token = extractCsrfToken(response.headers);
    console.log(`[DEBUG] CSRF token from headers: ${token ? token.substring(0, 20) + '...' : 'null'}`);
    if (!token) {
        // Debug: show all headers
        console.log('[DEBUG] Response headers:');
        response.headers.forEach((value, key) => console.log(`  ${key}: ${value.substring(0, 50)}`));
        return err(new Error('No CSRF token returned in response headers'));
    }

    // Update session state with new token.
    state.csrfToken = token;
    console.log(`[DEBUG] Stored CSRF token in state: ${state.csrfToken?.substring(0, 20)}...`);

    return ok(token);
}

/**
 * Login to SAP ADT server
 *
 * Currently supports basic authentication only.
 * SAML and SSO flows are not yet implemented.
 *
 * @param state - Session state to update
 * @param request - HTTP request function from client
 * @returns Session object or error
 */
export async function login(
    state: SessionState,
    request: RequestFn
): AsyncResult<Session, Error> {
    // Validate authentication type is supported.
    if (state.config.auth.type === 'saml') {
        return err(new Error('SAML authentication not yet implemented'));
    }

    if (state.config.auth.type === 'sso') {
        return err(new Error('SSO authentication not yet implemented'));
    }

    // Fetch CSRF token from SAP server.
    const [token, tokenErr] = await fetchCsrfToken(state, request);
    if (tokenErr) {
        return err(new Error(`Login failed: ${tokenErr.message}`));
    }

    // Extract username from authentication config.
    const username = state.config.auth.type === 'basic' ? state.config.auth.username : '';

    // Create session object with 8-hour expiration.
    const session: Session = {
        sessionId: token,
        username,
        expiresAt: Date.now() + (8 * 60 * 60 * 1000),
    };

    // Update session state.
    state.session = session;

    return ok(session);
}

/**
 * Logout from SAP ADT server
 *
 * Calls the SAP logoff endpoint and clears local state.
 *
 * @param state - Session state to clear
 * @param request - HTTP request function from client
 * @returns void or error
 */
export async function logout(
    state: SessionState,
    request: RequestFn
): AsyncResult<void, Error> {
    // Execute logout request to SAP server.
    const [response, requestErr] = await request({
        method: 'POST',
        path: '/sap/public/bc/icf/logoff',
    });

    if (requestErr) {
        return err(new Error(`Logout failed: ${requestErr.message}`));
    }

    if (!response.ok) {
        const text = await response.text();
        return err(new Error(`Logout failed with status ${response.status}: ${text}`));
    }

    // Clear local session state.
    state.csrfToken = null;
    state.session = null;

    return ok(undefined);
}

/**
 * Reset session by logging out and back in
 *
 * Called automatically on 500 errors to recover from session expiration.
 *
 * @param state - Session state to reset
 * @param request - HTTP request function from client
 * @returns void or error
 */
export async function sessionReset(
    state: SessionState,
    request: RequestFn
): AsyncResult<void, Error> {
    // Attempt to logout from current session.
    await logout(state, request);

    // Clear session state regardless of logout result.
    state.csrfToken = null;
    state.session = null;

    // Re-login to establish new session.
    const [, loginErr] = await login(state, request);
    if (loginErr) {
        return err(loginErr);
    }

    return ok(undefined);
}
