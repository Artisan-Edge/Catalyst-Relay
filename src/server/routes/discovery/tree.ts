/**
 * POST /tree — Hierarchical tree for package browsing
 */

import { treeQuerySchema } from '../../../types/requests';
import type { TreeQuery } from '../../../types/requests';
import type { TreeResponse } from '../../../core/adt';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { RouteContext } from '../types';

export async function treeHandler(c: RouteContext) {
    const body = await c.req.json();

    // Validate request body.
    const validation = treeQuerySchema.safeParse(body);
    if (!validation.success) {
        throw new ApiError(
            'VALIDATION_ERROR',
            `Invalid query: ${formatZodError(validation.error)}`,
            400
        );
    }

    const query = validation.data as TreeQuery;
    const client = c.get('client');

    const [tree, error] = await client.getTree(query);
    if (error) {
        throw new ApiError('UNKNOWN_ERROR', error.message, 500);
    }

    return c.json({
        success: true,
        data: tree satisfies TreeResponse,
    });
}
