/**
 * GET /transports/:transportId/objects — View all tasks and objects on a transport
 */

import type { TaskContents } from '../../../core/adt';
import { ApiError } from '../../middleware/error';
import type { RouteContext } from '../types';

// Response Type (colocated)
export type ViewTransportObjectsResponse = TaskContents[];

// Handler
export async function viewTransportObjectsHandler(c: RouteContext) {
    const transportId = c.req.param('transportId');

    if (!transportId) {
        throw new ApiError('VALIDATION_ERROR', 'Transport ID is required', 400);
    }

    const client = c.get('client');

    const [tasks, error] = await client.viewTransportObjects(transportId);

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: tasks satisfies ViewTransportObjectsResponse,
    });
}
