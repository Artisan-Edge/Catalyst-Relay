/**
 * GET /transports/:package — List transport requests for package
 */

import type { Transport } from '../../../core/adt';
import { ApiError } from '../../middleware/error';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type TransportsResponse = Transport[];

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function transportsHandler(c: RouteContext) {
    const packageName = c.req.param('package');

    if (!packageName) {
        throw new ApiError('VALIDATION_ERROR', 'Package name is required', 400);
    }

    const client = c.get('client');

    const [transports, error] = await client.getTransports(packageName);

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: transports satisfies TransportsResponse,
    });
}
