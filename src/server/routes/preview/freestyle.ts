/**
 * POST /preview/freestyle — Execute arbitrary OpenSQL via the freestyle endpoint
 */

import { z } from 'zod';
import type { DataFrame } from '../../../core/adt/data_extraction/previewParser';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export const freestyleRequestSchema = z.object({
    sqlQuery: z.string().min(1),
    limit: z.number().positive().max(50000).optional(),
    timeout: z.number().positive().max(300000).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type FreestyleResponse = DataFrame;

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function freestyleHandler(c: RouteContext) {
    const body = await c.req.json();

    const validation = freestyleRequestSchema.safeParse(body);
    if (!validation.success) {
        throw new ApiError(
            'VALIDATION_ERROR',
            `Invalid query: ${formatZodError(validation.error)}`,
            400
        );
    }

    const { sqlQuery, limit, timeout } = validation.data;
    const client = c.get('client');

    const [dataFrame, error] = await client.freestyleQuery(sqlQuery, limit, timeout);

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500, error.cause);
    }

    return c.json({
        success: true as const,
        data: dataFrame satisfies FreestyleResponse,
    });
}
