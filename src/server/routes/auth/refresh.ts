/**
 * POST /session/refresh — Refresh session via reentrance ticket
 */

import type { RouteContext } from '../types';
import type { RefreshResult } from '../../../core/session/refresh';

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type RefreshResponse = RefreshResult;

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export function refreshHandler() {
    return async (c: RouteContext) => {
        const client = c.get('client');

        const [result, refreshErr] = await client.refreshSession();
        if (refreshErr) {
            return c.json({
                success: false as const,
                error: refreshErr.message,
            }, 500);
        }

        return c.json({
            success: true,
            data: result as RefreshResponse,
        });
    };
}
