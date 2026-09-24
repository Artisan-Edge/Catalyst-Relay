/**
 * POST /api-release/:name/visibility — Change the visibility flags of a released C1 contract
 */

import { z } from 'zod';
import type { ApiReleaseVisibility, ApiReleaseVisibilityOptions, ApiReleaseVisibilityResult } from '../../../core/adt';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export const apiReleaseVisibilityRequestSchema = z.object({
    transport: z.string().optional(),
    // Omitted flags keep their current value
    useInCloudDevelopment: z.boolean().optional(),
    useInKeyUserApps: z.boolean().optional(),
    // Run SAP's validation only
    preview: z.boolean().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type ApiReleaseVisibilityResponse = ApiReleaseVisibilityResult;

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function apiReleaseVisibilityHandler(c: RouteContext) {
    const name = c.req.param('name');

    if (!name) {
        throw new ApiError('VALIDATION_ERROR', 'Object name is required', 400);
    }

    const body = await c.req.json().catch(() => ({}));
    const validation = apiReleaseVisibilityRequestSchema.safeParse(body);
    if (!validation.success) {
        throw new ApiError(
            'VALIDATION_ERROR',
            `Invalid request: ${formatZodError(validation.error)}`,
            400
        );
    }

    const { transport, preview, useInCloudDevelopment, useInKeyUserApps } = validation.data;
    const change: Partial<ApiReleaseVisibility> = {};
    if (useInCloudDevelopment !== undefined) change.useInCloudDevelopment = useInCloudDevelopment;
    if (useInKeyUserApps !== undefined) change.useInKeyUserApps = useInKeyUserApps;
    const options: ApiReleaseVisibilityOptions = {};
    if (transport) options.transport = transport;
    if (preview !== undefined) options.preview = preview;

    const client = c.get('client');
    const [result, error] = await client.updateApiReleaseVisibility(name, change, options);

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: result satisfies ApiReleaseVisibilityResponse,
    });
}
