/**
 * GET /packages — List available packages
 *
 * Query params:
 *   - filter: Package name pattern (default: '*')
 *             Examples: 'Z*' for custom, '$TMP' for local, 'ZSNAP*' for prefix
 */

import type { Package } from '../../../core/adt';
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

    // Get optional filter from query params (e.g., /packages?filter=Z*)
    const filter = c.req.query('filter') || '*';

    const [packages, error] = await client.getPackages(filter);

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: packages satisfies PackagesResponse,
    });
}
