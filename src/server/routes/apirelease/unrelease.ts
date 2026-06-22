/**
 * POST /api-release/:name/unrelease — Unrelease the C1 API contract of a CDS query
 */

import { z } from 'zod';
import type { ApiReleaseResult } from '../../../core/adt';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export const unreleaseApiRequestSchema = z.object({
    transport: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type UnreleaseApiResponse = ApiReleaseResult;

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function unreleaseApiHandler(c: RouteContext) {
    const name = c.req.param('name');

    if (!name) {
        throw new ApiError('VALIDATION_ERROR', 'Object name is required', 400);
    }

    // Body is optional (transport may be omitted for local objects).
    const body = await c.req.json().catch(() => ({}));
    const validation = unreleaseApiRequestSchema.safeParse(body);
    if (!validation.success) {
        throw new ApiError(
            'VALIDATION_ERROR',
            `Invalid request: ${formatZodError(validation.error)}`,
            400
        );
    }

    const client = c.get('client');

    const [result, error] = await client.unreleaseApi(name, validation.data.transport);

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: result satisfies UnreleaseApiResponse,
    });
}
