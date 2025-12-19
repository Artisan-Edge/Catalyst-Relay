/**
 * POST /where-used — Find object dependencies (batch operation)
 */

import { z } from 'zod';
import { objectRefSchema } from '../../../types/requests';
import type { Dependency } from '../../../core/adt';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export const whereUsedRequestSchema = z.array(objectRefSchema);

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type WhereUsedResponse = Dependency[][];

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function whereUsedHandler(c: RouteContext) {
    const body = await c.req.json();

    // Validate array of object refs
    const validation = whereUsedRequestSchema.safeParse(body);
    if (!validation.success) {
        throw new ApiError(
            'VALIDATION_ERROR',
            `Invalid object references: ${formatZodError(validation.error)}`,
            400
        );
    }

    const objectRefs = validation.data;
    const client = c.get('client');

    // Process all where-used queries in parallel
    const results = await Promise.all(
        objectRefs.map(async (objectRef) => {
            const [dependencies, error] = await client.whereUsed(objectRef);

            if (error) {
                throw new ApiError('UNKNOWN_ERROR', error.message, 500);
            }

            return dependencies;
        })
    );

    return c.json({
        success: true,
        data: results satisfies WhereUsedResponse,
    });
}
