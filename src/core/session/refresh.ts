/**
 * Session Refresh via Reentrance Ticket
 *
 * Fetches a reentrance ticket from SAP ADT to keep the session alive.
 * Eclipse ADT uses this mechanism to maintain sessions across extended periods.
 *
 * Endpoint: GET /sap/bc/adt/security/reentranceticket
 * - Returns a base64-encoded SSO ticket
 * - Refreshes server-side session cookies (MYSAPSSO2)
 */

import type { AsyncResult } from '../../types/result';
import type { SessionState } from './login';
import { getSessionTimeout } from './login';
import { ok, err } from '../../types/result';
import { debug } from '../utils';

// Request function type signature (provided by client.ts)
type RequestFn = (options: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    params?: Record<string, string | number>;
    headers?: Record<string, string>;
    body?: string;
}) => AsyncResult<Response, Error>;

const REENTRANCE_TICKET_PATH = '/sap/bc/adt/security/reentranceticket';

/**
 * Result of a session refresh operation
 */
export interface RefreshResult {
    /** Base64-encoded reentrance ticket */
    ticket: string;
    /** Updated session expiration timestamp (ms since epoch) */
    expiresAt: number;
}

/**
 * Refresh session by fetching a reentrance ticket
 *
 * Calls the SAP ADT reentrance ticket endpoint to extend the session lifetime.
 * The server responds with an SSO ticket and refreshes the MYSAPSSO2 cookie.
 *
 * @param state - Session state to update
 * @param request - HTTP request function from client
 * @returns RefreshResult with ticket and new expiration, or error
 */
export async function refreshSession(
    state: SessionState,
    request: RequestFn
): AsyncResult<RefreshResult, Error> {
    if (!state.session) {
        return err(new Error('Not logged in'));
    }

    debug('Fetching reentrance ticket to refresh session...');

    const [response, reqErr] = await request({
        method: 'GET',
        path: REENTRANCE_TICKET_PATH,
        headers: { 'Accept': 'text/plain' },
    });

    if (reqErr) {
        return err(new Error(`Session refresh failed: ${reqErr.message}`));
    }

    if (!response.ok) {
        const text = await response.text();
        return err(new Error(`Session refresh failed (${response.status}): ${text}`));
    }

    // Extract ticket from response body
    const ticket = await response.text();
    debug(`Received reentrance ticket: ${ticket.substring(0, 20)}...`);

    // Update session expiration based on auth type
    const timeout = getSessionTimeout(state.config.auth.type);
    state.session.expiresAt = Date.now() + timeout;

    debug(`Session refreshed, new expiration: ${new Date(state.session.expiresAt).toISOString()}`);

    return ok({ ticket, expiresAt: state.session.expiresAt });
}
