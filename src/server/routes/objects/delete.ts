// DELETE /objects/:transport — Multi-delete with dependency analysis

import { z } from 'zod';
import { objectRefSchema } from '../../../types/requests';
import type { DeleteResult } from '../../../core/adt';
import { ExternalReferencesError } from '../../../core/adt';
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

export type DeleteResponse = DeleteResult[];

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteHandler(c: RouteContext) {
    const transport = c.req.param('transport');
    const body = await c.req.json();

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

    const [results, error] = await client.delete(objectRefs, transport || undefined);

    if (error) {
        if (error instanceof ExternalReferencesError) {
            return c.json(
                {
                    success: false as const,
                    error: error.message,
                    code: 'EXTERNAL_REFERENCES' as const,
                    references: error.references,
                },
                409
            );
        }
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: results satisfies DeleteResponse,
    });
}
