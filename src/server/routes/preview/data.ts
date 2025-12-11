/**
 * POST /preview/data — Query table/view data with filters and sorting
 */

import { previewQuerySchema } from '../../../types/requests';
import type { PreviewSQL } from '../../../types/requests';
import type { DataFrame } from '../../../core/adt/previewParser';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema (colocated - uses shared schema)
// ─────────────────────────────────────────────────────────────────────────────

// Uses previewQuerySchema from types/requests.ts

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type DataPreviewResponse = DataFrame;

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function dataHandler(c: RouteContext) {
    const body = await c.req.json();

    // Validate request body
    const validation = previewQuerySchema.safeParse(body);
    if (!validation.success) {
        throw new ApiError(
            'VALIDATION_ERROR',
            `Invalid query: ${formatZodError(validation.error)}`,
            400
        );
    }

    // Cast needed due to exactOptionalPropertyTypes + Zod inference
    const query = validation.data as PreviewSQL;
    const client = c.get('client');

    const [dataFrame, error] = await client.previewData(query);

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: dataFrame satisfies DataPreviewResponse,
    });
}
