/**
 * POST /preview/distinct — Get distinct values for column with counts
 */

import { z } from 'zod';
import type { DistinctResult } from '../../../core/adt';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema (colocated)
// ─────────────────────────────────────────────────────────────────────────────

const parameterSchema = z.object({
    name: z.string().min(1),
    value: z.string(),
});

export const distinctRequestSchema = z.object({
    objectName: z.string().min(1),
    parameters: z.array(parameterSchema).optional().default([]),
    column: z.string().min(1),
});

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type DistinctResponse = DistinctResult;

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function distinctHandler(c: RouteContext) {
    const body = await c.req.json();

    // Validate request body
    const validation = distinctRequestSchema.safeParse(body);
    if (!validation.success) {
        throw new ApiError(
            'VALIDATION_ERROR',
            `Invalid request: ${formatZodError(validation.error)}`,
            400
        );
    }

    const { objectName, parameters, column } = validation.data;
    const client = c.get('client');

    const [distinctResult, error] = await client.getDistinctValues(objectName, parameters, column);

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: distinctResult satisfies DistinctResponse,
    });
}
