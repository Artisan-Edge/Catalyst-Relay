/**
 * DELETE /logout — End session and cleanup client
 */

import type { ISessionManager, RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type LogoutResponse = null;

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export function logoutHandler(sessionManager: ISessionManager) {
    return async (c: RouteContext) => {
        const client = c.get('client');
        const sessionId = c.get('sessionId');

        // Logout client
        const [, logoutErr] = await client.logout();
        if (logoutErr) {
            console.error('Logout error:', logoutErr);
            // Continue with session cleanup even if logout fails
        }

        // Destroy session
        sessionManager.destroySession(sessionId);

        // Check if any other sessions reference this client
        const allSessions = sessionManager.getAllSessions();
        const clientStillInUse = allSessions.some(([, entry]) => entry.client === client);

        // TODO: Implement client cleanup when no sessions reference it
        // Need to unregister config hash from manager, but requires tracking hash per session
        if (!clientStillInUse) {
            // sessionManager.unregisterClient(configHash) — need to track hash per session
        }

        return c.json({
            success: true,
            data: null as LogoutResponse,
        });
    };
}
