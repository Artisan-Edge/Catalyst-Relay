/**
 * POST /transports — Create a new transport request
 */

import { z } from 'zod';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export const createTransportRequestSchema = z.object({
    package: z.string().min(1, 'Package name is required'),
    description: z.string().min(1, 'Transport description is required'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateTransportResponse {
    transportId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function createTransportHandler(c: RouteContext) {
    const body = await c.req.json();

    // Validate request body.
    const validation = createTransportRequestSchema.safeParse(body);
    if (!validation.success) {
        throw new ApiError(
            'VALIDATION_ERROR',
            `Invalid request: ${formatZodError(validation.error)}`,
            400
        );
    }

    const { package: packageName, description } = validation.data;
    const client = c.get('client');

    const [transportId, error] = await client.createTransport({
        package: packageName,
        description,
    });

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: { transportId } satisfies CreateTransportResponse,
    });
}
