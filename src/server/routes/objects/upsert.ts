/**
 * POST /objects/upsert/:package/:transport — Create or update objects
 */

import { z } from 'zod';
import { objectContentSchema } from '../../../types/requests';
import type { ObjectContent } from '../../../types/requests';
import type { UpsertResult } from '../../../types/responses';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export const upsertRequestSchema = z.array(objectContentSchema);

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type UpsertResponse = UpsertResult[];

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertHandler(c: RouteContext) {
    const packageName = c.req.param('package');
    const transport = c.req.param('transport');

    if (!packageName) {
        throw new ApiError('VALIDATION_ERROR', 'Package name is required', 400);
    }

    // Transport validation - required for non-temporary packages
    if (packageName !== '$TMP' && !transport) {
        throw new ApiError(
            'TRANSPORT_REQUIRED',
            `Transport required for non-temporary package ${packageName}`,
            400
        );
    }

    const body = await c.req.json();

    // Validate array of object contents
    const validation = upsertRequestSchema.safeParse(body);
    if (!validation.success) {
        throw new ApiError(
            'VALIDATION_ERROR',
            `Invalid objects: ${formatZodError(validation.error)}`,
            400
        );
    }

    // Cast needed due to exactOptionalPropertyTypes + Zod inference
    const objectContents = validation.data as ObjectContent[];
    const client = c.get('client');

    const [results, error] = await client.upsert(objectContents, transport || '');

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: results satisfies UpsertResponse,
    });
}
