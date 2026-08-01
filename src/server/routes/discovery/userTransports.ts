/**
 * GET /usertransports — List transport requests owned by a user
 */

import type { UserTransport, TransportType, TransportStatus } from '../../../core/adt';
import { ApiError } from '../../middleware/error';
import type { RouteContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export type UserTransportsResponse = UserTransport[];

const TRANSPORT_TYPES: readonly TransportType[] = ['workbench', 'customizing'];
const TRANSPORT_STATUSES: readonly TransportStatus[] = ['modifiable', 'released'];

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function userTransportsHandler(c: RouteContext) {
    const user = c.req.query('user');
    const type = c.req.query('type');
    const status = c.req.query('status');

    if (type && !TRANSPORT_TYPES.includes(type as TransportType)) {
        throw new ApiError('VALIDATION_ERROR', `Invalid type '${type}'. Use one of: ${TRANSPORT_TYPES.join(', ')}`, 400);
    }
    if (status && !TRANSPORT_STATUSES.includes(status as TransportStatus)) {
        throw new ApiError('VALIDATION_ERROR', `Invalid status '${status}'. Use one of: ${TRANSPORT_STATUSES.join(', ')}`, 400);
    }

    const client = c.get('client');

    const [transports, error] = await client.getUserTransports({
        ...(user ? { user } : {}),
        ...(type ? { type: type as TransportType } : {}),
        ...(status ? { status: status as TransportStatus } : {}),
    });

    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: transports satisfies UserTransportsResponse,
    });
}
