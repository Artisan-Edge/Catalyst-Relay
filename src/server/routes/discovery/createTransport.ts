/**
 * POST /transports — Create a new transport request
 */

import * as z from 'zod';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { RouteContext } from '../types';
import type { TransportConfig } from '../../../core/adt';
import { MultipleTransportTargetsError } from '../../../core/adt';

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export const createTransportRequestSchema = z.object({
    description: z.string().min(1, 'Transport description is required'),
    type: z.enum(['workbench', 'customizing']).optional(),
    target: z.string().min(1).optional(),
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

    const { description, type, target } = validation.data;
    const client = c.get('client');

    const config: TransportConfig = {
        description,
        ...(type ? { type } : {}),
        ...(target ? { target } : {}),
    };

    const [transportId, error] = await client.createTransport(config);

    if (error) {
        // Several targets and none given: list them so the caller can pick one
        if (error instanceof MultipleTransportTargetsError) {
            return c.json(
                {
                    success: false as const,
                    error: error.message,
                    code: 'MULTIPLE_TRANSPORT_TARGETS' as const,
                    targets: error.targets,
                },
                409
            );
        }
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: { transportId } satisfies CreateTransportResponse,
    });
}
