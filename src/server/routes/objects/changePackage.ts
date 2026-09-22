// POST /objects/change-package — Reassign objects to another package

import { z } from 'zod';
import { objectRefSchema } from '../../../types/requests';
import type { ChangePackageOptions, ChangePackageResult } from '../../../core/adt';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export const changePackageRequestSchema = z.object({
    objects: z.array(objectRefSchema).min(1),
    package: z.string().min(1),
    transport: z.string().optional(),
    preview: z.boolean().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type ChangePackageResponse = ChangePackageResult[];

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function changePackageHandler(c: RouteContext) {
    const body = await c.req.json();

    const validation = changePackageRequestSchema.safeParse(body);
    if (!validation.success) {
        throw new ApiError(
            'VALIDATION_ERROR',
            `Invalid request: ${formatZodError(validation.error)}`,
            400
        );
    }

    const { objects, package: targetPackage, transport, preview } = validation.data;
    const options: ChangePackageOptions = {};
    if (transport) options.transport = transport;
    if (preview) options.preview = preview;

    const client = c.get('client');

    const [results, error] = await client.changePackage(objects, targetPackage, options);

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: results satisfies ChangePackageResponse,
    });
}
