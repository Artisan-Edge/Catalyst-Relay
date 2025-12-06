/**
 * POST /search/:query — Search for objects by name/pattern
 */

import { z } from 'zod';
import type { SearchResult } from '../../../types/responses';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export const searchRequestSchema = z.array(z.string());

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type SearchResponse = SearchResult[];

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function searchHandler(c: RouteContext) {
    const query = c.req.param('query');

    if (!query) {
        throw new ApiError('VALIDATION_ERROR', 'Search query is required', 400);
    }

    const body = await c.req.json();

    // Validate array of types
    const validation = searchRequestSchema.safeParse(body);
    if (!validation.success) {
        throw new ApiError(
            'VALIDATION_ERROR',
            `Invalid types array: ${formatZodError(validation.error)}`,
            400
        );
    }

    const types = validation.data;
    const client = c.get('client');

    const [results, error] = await client.search(query, types.length > 0 ? types : undefined);

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: results satisfies SearchResponse,
    });
}
