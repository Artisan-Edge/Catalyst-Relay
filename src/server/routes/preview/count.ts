/**
 * POST /preview/count — Get total row count for table/view
 */

import { z } from 'zod';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export const countRequestSchema = z.object({
    objectName: z.string().min(1),
    objectType: z.enum(['table', 'view']),
});

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type CountResponse = number;

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function countHandler(c: RouteContext) {
    const body = await c.req.json();

    // Validate request body
    const validation = countRequestSchema.safeParse(body);
    if (!validation.success) {
        throw new ApiError(
            'VALIDATION_ERROR',
            `Invalid request: ${formatZodError(validation.error)}`,
            400
        );
    }

    const { objectName, objectType } = validation.data;
    const client = c.get('client');

    const [count, error] = await client.countRows(objectName, objectType);

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: count satisfies CountResponse,
    });
}
