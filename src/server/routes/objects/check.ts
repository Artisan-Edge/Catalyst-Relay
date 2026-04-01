// POST /objects/check — Syntax check objects (non-destructive)

import { z } from 'zod';
import { objectRefSchema } from '../../../types/requests';
import type { CheckResult } from '../../../core/adt/craud/syntaxCheck';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export const checkRequestSchema = z.array(objectRefSchema);

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type CheckResponse = CheckResult[];

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function checkHandler(c: RouteContext) {
    const body = await c.req.json();

    // Validate array of object refs
    const validation = checkRequestSchema.safeParse(body);
    if (!validation.success) {
        throw new ApiError(
            'VALIDATION_ERROR',
            `Invalid objects: ${formatZodError(validation.error)}`,
            400
        );
    }

    const objectRefs = validation.data;
    const client = c.get('client');

    const [results, error] = await client.checkSyntax(objectRefs);

    if (error) {
        throw new ApiError('CHECK_FAILED', error.message, 500);
    }

    return c.json({
        success: true,
        data: results satisfies CheckResponse,
    });
}
