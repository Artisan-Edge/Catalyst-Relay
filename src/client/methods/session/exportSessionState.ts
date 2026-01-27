/**
 * Export session state for persistence across processes
 */

import type { ExportableSessionState } from '../../../core/session/types';
import type { ClientContext, SsoCerts } from '../../types';
import { getCertificatePaths } from '../../../core/auth/sso/storage';

export function exportSessionState(
    ctx: ClientContext,
    ssoCerts: SsoCerts | undefined
): ExportableSessionState | null {
    if (!ctx.state.session || !ctx.state.csrfToken) return null;

    // Convert cookies Map to array format
    const cookies: Array<{ name: string; value: string }> = [];
    for (const [name, value] of ctx.state.cookies) {
        cookies.push({ name, value });
    }

    const state: ExportableSessionState = {
        csrfToken: ctx.state.csrfToken,
        session: ctx.state.session,
        cookies,
        authType: ctx.state.authStrategy.type,
    };

    // For SSO, include certificate paths (not contents for security)
    if (ctx.state.authStrategy.type === 'sso' && ssoCerts) {
        state.ssoCertPaths = getCertificatePaths();
    }

    return state;
}
