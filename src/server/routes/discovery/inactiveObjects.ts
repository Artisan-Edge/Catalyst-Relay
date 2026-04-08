/**
 * GET /inactive-objects — List inactive (unactivated) objects and transports
 */

import type { InactiveEntry } from '../../../core/adt';
import { ApiError } from '../../middleware/error';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type InactiveObjectsResponse = InactiveEntry[];

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function inactiveObjectsHandler(c: RouteContext) {
    const client = c.get('client');

    const [entries, error] = await client.getInactiveObjects();

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: entries satisfies InactiveObjectsResponse,
    });
}
