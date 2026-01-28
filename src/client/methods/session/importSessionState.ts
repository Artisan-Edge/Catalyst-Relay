/**
 * Import session state from persistence
 */

import type { AsyncResult } from '../../../types/result';
import type { ExportableSessionState } from '../../../core/session/types';
import type { ClientContext, SsoCerts } from '../../types';
import { ok, err } from '../../../types/result';
import { debug, CSRF_TOKEN_HEADER, FETCH_CSRF_TOKEN, extractCsrfToken } from '../../../core/utils';

// Default auto-refresh interval: 30 min
const DEFAULT_REFRESH_INTERVAL = 30 * 60 * 1000;

export async function importSessionState(
    ctx: ClientContext,
    state: ExportableSessionState,
    setSsoCerts: (certs: SsoCerts) => void
): AsyncResult<boolean> {
    debug(`importSessionState: starting import`);

    // Validate session hasn't expired
    if (state.session.expiresAt <= Date.now()) {
        debug(`importSessionState: session expired`);
        return err(new Error('Session has expired'));
    }
    debug(`importSessionState: session expiry OK (expires at ${state.session.expiresAt})`);

    // Restore session state
    ctx.state.session = state.session;
    ctx.state.csrfToken = state.csrfToken;
    debug(`importSessionState: restored session and CSRF token`);

    // Restore cookies from array to Map
    ctx.state.cookies.clear();
    for (const cookie of state.cookies) {
        ctx.state.cookies.set(cookie.name, cookie.value);
    }
    debug(`importSessionState: restored ${state.cookies.length} cookies`);

    // For SSO, load certificates from paths
    if (state.authType === 'sso' && state.ssoCertPaths) {
        debug(`importSessionState: loading SSO certs from ${state.ssoCertPaths.fullChainPath}`);
        try {
            const fs = await import('fs/promises');
            const [fullChain, key] = await Promise.all([
                fs.readFile(state.ssoCertPaths.fullChainPath, 'utf-8'),
                fs.readFile(state.ssoCertPaths.keyPath, 'utf-8'),
            ]);
            setSsoCerts({ cert: fullChain, key });
            debug(`importSessionState: SSO certs loaded successfully`);
        } catch (certErr) {
            debug(`importSessionState: SSO cert load failed: ${certErr}`);
            return err(new Error(`Failed to load SSO certificates: ${certErr instanceof Error ? certErr.message : String(certErr)}`));
        }
    }

    // Fetch fresh CSRF token using the restored session cookies
    // The cached CSRF token is tied to the original process, so we need a new one
    debug(`importSessionState: fetching fresh CSRF token...`);

    const [response, reqErr] = await ctx.request({
        method: 'GET',
        path: '/sap/bc/adt/compatibility/graph',
        headers: {
            [CSRF_TOKEN_HEADER]: FETCH_CSRF_TOKEN,
        },
    });
    debug(`importSessionState: CSRF fetch completed`);

    if (reqErr) {
        debug(`importSessionState: CSRF fetch error: ${reqErr.message}`);
        ctx.state.session = null;
        ctx.state.csrfToken = null;
        ctx.state.cookies.clear();
        return err(new Error(`Session validation failed: ${reqErr.message}`));
    }

    if (!response.ok) {
        debug(`importSessionState: CSRF fetch failed with status ${response.status}`);
        ctx.state.session = null;
        ctx.state.csrfToken = null;
        ctx.state.cookies.clear();
        return err(new Error(`Session validation failed with status ${response.status}`));
    }

    // Extract and store the new CSRF token
    const newToken = extractCsrfToken(response.headers);
    if (!newToken) {
        debug(`importSessionState: no CSRF token in response headers`);
        ctx.state.session = null;
        ctx.state.csrfToken = null;
        ctx.state.cookies.clear();
        return err(new Error('Session validation failed: no CSRF token returned'));
    }

    ctx.state.csrfToken = newToken;
    debug(`importSessionState: new CSRF token obtained: ${newToken.substring(0, 20)}...`);

    // Start auto-refresh if enabled
    const autoRefresh = ctx.state.config.autoRefresh ?? { enabled: true };
    if (autoRefresh.enabled) {
        const interval = autoRefresh.intervalMs ?? DEFAULT_REFRESH_INTERVAL;
        ctx.startAutoRefresh(interval);
        debug(`Auto-refresh started with ${interval}ms interval (after import)`);
    }

    debug(`importSessionState: import complete`);
    return ok(true);
}
