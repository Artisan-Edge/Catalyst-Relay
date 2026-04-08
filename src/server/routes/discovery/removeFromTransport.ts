/**
 * PUT /transports/:transportId/objects — Remove an object from a transport
 */

import { z } from 'zod';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export const removeFromTransportRequestSchema = z.object({
    name: z.string().min(1, 'Object name is required'),
    description: z.string().min(1, 'Object description is required'),
    pgmid: z.string().min(1, 'Program ID is required'),
    type: z.string().min(1, 'Object type is required'),
    position: z.string().min(1, 'Position is required'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function removeFromTransportHandler(c: RouteContext) {
    const transportId = c.req.param('transportId');

    if (!transportId) {
        throw new ApiError('VALIDATION_ERROR', 'Transport ID is required', 400);
    }

    const body = await c.req.json();

    // Validate request body.
    const validation = removeFromTransportRequestSchema.safeParse(body);
    if (!validation.success) {
        throw new ApiError(
            'VALIDATION_ERROR',
            `Invalid request: ${formatZodError(validation.error)}`,
            400
        );
    }

    const client = c.get('client');

    const [, error] = await client.removeFromTransport(transportId, validation.data);

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: { transportId, removed: validation.data.name },
    });
}
