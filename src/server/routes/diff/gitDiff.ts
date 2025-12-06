/**
 * POST /git-diff — Compare local content with server content
 */

import { z } from 'zod';
import { objectContentSchema } from '../../../types/requests';
import type { ObjectContent } from '../../../types/requests';
import type { DiffResult } from '../../../core/adt/gitDiff';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export const gitDiffRequestSchema = z.array(objectContentSchema);

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type GitDiffResponse = DiffResult[];

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function gitDiffHandler(c: RouteContext) {
    const body = await c.req.json();

    // Validate array of objects with content.
    const validation = gitDiffRequestSchema.safeParse(body);
    if (!validation.success) {
        throw new ApiError(
            'VALIDATION_ERROR',
            `Invalid objects: ${formatZodError(validation.error)}`,
            400
        );
    }

    const objects = validation.data as ObjectContent[];
    const client = c.get('client');

    const [results, error] = await client.gitDiff(objects);

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: results satisfies GitDiffResponse,
    });
}
