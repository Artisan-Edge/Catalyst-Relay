/**
 * POST /api-release/:name/release — Release the C1 API contract of a CDS query
 */

import { z } from 'zod';
import type { ApiReleaseResult } from '../../../core/adt';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export const releaseApiRequestSchema = z.object({
    transport: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type ReleaseApiResponse = ApiReleaseResult;

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function releaseApiHandler(c: RouteContext) {
    const name = c.req.param('name');

    if (!name) {
        throw new ApiError('VALIDATION_ERROR', 'Object name is required', 400);
    }

    // Body is optional (transport may be omitted for local objects).
    const body = await c.req.json().catch(() => ({}));
    const validation = releaseApiRequestSchema.safeParse(body);
    if (!validation.success) {
        throw new ApiError(
            'VALIDATION_ERROR',
            `Invalid request: ${formatZodError(validation.error)}`,
            400
        );
    }

    const client = c.get('client');

    const [result, error] = await client.releaseApi(name, validation.data.transport);

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: result satisfies ReleaseApiResponse,
    });
}
