/**
 * GET /api-release/:name — Read the C1 API release state of a CDS DDL source
 */

import type { ApiReleaseState } from '../../../core/adt';
import { ApiError } from '../../middleware/error';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type ApiReleaseStateResponse = ApiReleaseState;

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function apiReleaseStateHandler(c: RouteContext) {
    const name = c.req.param('name');

    if (!name) {
        throw new ApiError('VALIDATION_ERROR', 'Object name is required', 400);
    }

    const client = c.get('client');

    const [state, error] = await client.getApiReleaseState(name);

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: state satisfies ApiReleaseStateResponse,
    });
}
