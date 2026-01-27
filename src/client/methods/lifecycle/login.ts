/**
 * Client login method
 */

import type { AsyncResult } from '../../../types/result';
import type { Session } from '../../../core/session/types';
import type { ClientContext, SsoCerts } from '../../types';
import { ok, err } from '../../../types/result';
import * as sessionOps from '../../../core/session';
import { debug } from '../../../core/utils';

// Default auto-refresh interval: 30 min
const DEFAULT_REFRESH_INTERVAL = 30 * 60 * 1000;

export async function login(
    ctx: ClientContext,
    setSsoCerts: (certs: SsoCerts) => void
): AsyncResult<Session> {
    const { authStrategy } = ctx.state;

    // For SSO and SAML, perform initial authentication (certificate enrollment or browser login)
    if (authStrategy.performLogin) {
        const [, loginErr] = await authStrategy.performLogin(fetch);
        if (loginErr) {
            return err(loginErr);
        }
    }

    // For SAML, transfer cookies from auth strategy to client cookie store
    if (authStrategy.type === 'saml' && authStrategy.getCookies) {
        const cookies = authStrategy.getCookies();
        for (const cookie of cookies) {
            ctx.state.cookies.set(cookie.name, cookie.value);
        }
        debug(`Transferred ${cookies.length} SAML cookies to client`);
    }

    // For SSO with mTLS, store certificates for use in requests
    if (authStrategy.type === 'sso' && authStrategy.getCertificates) {
        const certs = authStrategy.getCertificates();
        if (certs) {
            setSsoCerts({
                cert: certs.fullChain,
                key: certs.privateKey,
            });
            debug('Stored mTLS certificates for SSO authentication');
        }
    }

    const [session, loginErr] = await sessionOps.login(ctx.state, ctx.request);
    if (loginErr) {
        return err(loginErr);
    }

    // Start auto-refresh if enabled (default: true)
    const autoRefresh = ctx.state.config.autoRefresh ?? { enabled: true };
    if (autoRefresh.enabled) {
        const interval = autoRefresh.intervalMs ?? DEFAULT_REFRESH_INTERVAL;
        ctx.startAutoRefresh(interval);
        debug(`Auto-refresh started with ${interval}ms interval`);
    }

    return ok(session);
}
