/**
 * POST /objects/class-include — Write a class local-source include (CCDEF/CCIMP/CCMAC/CCAU)
 */

import { z } from 'zod';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export const classIncludeRequestSchema = z.object({
    className: z.string().min(1),
    includeType: z.enum(['definitions', 'implementations', 'macros', 'testclasses']),
    source: z.string(),
    transport: z.string().min(1).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export interface ClassIncludeResponse {
    className: string;
    includeType: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function classIncludeHandler(c: RouteContext) {
    const body = await c.req.json();

    const validation = classIncludeRequestSchema.safeParse(body);
    if (!validation.success) {
        throw new ApiError(
            'VALIDATION_ERROR',
            `Invalid request: ${formatZodError(validation.error)}`,
            400
        );
    }

    const { className, includeType, source, transport } = validation.data;
    const client = c.get('client');

    const [, error] = await client.writeClassInclude(className, includeType, source, transport);
    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: { className, includeType } satisfies ClassIncludeResponse,
    });
}
