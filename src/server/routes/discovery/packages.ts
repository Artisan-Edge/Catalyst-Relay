/**
 * GET /packages — List all available packages
 */

import type { Package } from '../../../types/responses';
import { ApiError } from '../../middleware/error';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type PackagesResponse = Package[];

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function packagesHandler(c: RouteContext) {
    const client = c.get('client');

    const [packages, error] = await client.getPackages();

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: packages satisfies PackagesResponse,
    });
}
