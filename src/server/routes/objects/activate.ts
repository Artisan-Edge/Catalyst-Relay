/**
 * POST /objects/activate — Activate objects (make runtime-available)
 */

import { z } from 'zod';
import { objectRefSchema } from '../../../types/requests';
import type { ActivationResult } from '../../../types/responses';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export const activateRequestSchema = z.array(objectRefSchema);

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type ActivateResponse = ActivationResult[];

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function activateHandler(c: RouteContext) {
    const body = await c.req.json();

    // Validate array of object refs
    const validation = activateRequestSchema.safeParse(body);
    if (!validation.success) {
        throw new ApiError(
            'VALIDATION_ERROR',
            `Invalid objects: ${formatZodError(validation.error)}`,
            400
        );
    }

    const objectRefs = validation.data;
    const client = c.get('client');

    const [results, error] = await client.activate(objectRefs);

    if (error) {
        throw new ApiError('ACTIVATION_FAILED', error.message, 500);
    }

    return c.json({
        success: true,
        data: results satisfies ActivateResponse,
    });
}
