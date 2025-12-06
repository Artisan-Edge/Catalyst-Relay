/**
 * DELETE /objects/:transport — Delete objects from transport
 */

import { z } from 'zod';
import { objectRefSchema } from '../../../types/requests';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export const deleteRequestSchema = z.array(objectRefSchema);

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type DeleteResponse = null;

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteHandler(c: RouteContext) {
    const transport = c.req.param('transport');
    const body = await c.req.json();

    // Validate array of object refs
    const validation = deleteRequestSchema.safeParse(body);
    if (!validation.success) {
        throw new ApiError(
            'VALIDATION_ERROR',
            `Invalid objects: ${formatZodError(validation.error)}`,
            400
        );
    }

    const objectRefs = validation.data;
    const client = c.get('client');

    const [, error] = await client.delete(objectRefs, transport || undefined);

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: null as DeleteResponse,
    });
}
