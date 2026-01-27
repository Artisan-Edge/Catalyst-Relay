/**
 * Import session state from persistence
 */

import type { AsyncResult } from '../../../types/result';
import type { ExportableSessionState } from '../../../core/session/types';
import type { ClientContext, SsoCerts } from '../../types';
import { ok, err } from '../../../types/result';
import { debug } from '../../../core/utils';

// Default auto-refresh interval: 30 min
const DEFAULT_REFRESH_INTERVAL = 30 * 60 * 1000;

export async function importSessionState(
    ctx: ClientContext,
    state: ExportableSessionState,
    setSsoCerts: (certs: SsoCerts) => void
): AsyncResult<boolean> {
    // Validate session hasn't expired
    if (state.session.expiresAt <= Date.now()) {
        return err(new Error('Session has expired'));
    }

    // Restore session state
    ctx.state.session = state.session;
    ctx.state.csrfToken = state.csrfToken;

    // Restore cookies from array to Map
    ctx.state.cookies.clear();
    for (const cookie of state.cookies) {
        ctx.state.cookies.set(cookie.name, cookie.value);
    }

    // For SSO, load certificates from paths
    if (state.authType === 'sso' && state.ssoCertPaths) {
        try {
            const fs = await import('fs/promises');
            const [fullChain, key] = await Promise.all([
                fs.readFile(state.ssoCertPaths.fullChainPath, 'utf-8'),
                fs.readFile(state.ssoCertPaths.keyPath, 'utf-8'),
            ]);
            setSsoCerts({ cert: fullChain, key });
        } catch (certErr) {
            return err(new Error(`Failed to load SSO certificates: ${certErr instanceof Error ? certErr.message : String(certErr)}`));
        }
    }

    // Validate session is still valid with a lightweight request
    const [response, reqErr] = await ctx.request({
        method: 'GET',
        path: '/sap/bc/adt/compatibility/graph',
    });

    if (reqErr) {
        ctx.state.session = null;
        ctx.state.csrfToken = null;
        ctx.state.cookies.clear();
        return err(new Error(`Session validation failed: ${reqErr.message}`));
    }

    if (!response.ok) {
        ctx.state.session = null;
        ctx.state.csrfToken = null;
        ctx.state.cookies.clear();
        return err(new Error(`Session validation failed with status ${response.status}`));
    }

    // Start auto-refresh if enabled
    const autoRefresh = ctx.state.config.autoRefresh ?? { enabled: true };
    if (autoRefresh.enabled) {
        const interval = autoRefresh.intervalMs ?? DEFAULT_REFRESH_INTERVAL;
        ctx.startAutoRefresh(interval);
        debug(`Auto-refresh started with ${interval}ms interval (after import)`);
    }

    return ok(true);
}
