/**
 * DELETE /transports/:transportId — Delete a transport request
 */

import { ApiError } from '../../middleware/error';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteTransportHandler(c: RouteContext) {
    const transportId = c.req.param('transportId');

    if (!transportId) {
        throw new ApiError('VALIDATION_ERROR', 'Transport ID is required', 400);
    }

    // Query param ?removeObjects=true will remove all objects before deleting.
    const removeObjects = c.req.query('removeObjects') === 'true';

    const client = c.get('client');

    const [, error] = await client.deleteTransport(transportId, removeObjects);

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: { transportId },
    });
}
