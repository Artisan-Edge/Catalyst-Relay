/**
 * Data preview routes
 *
 * Handles table/view data querying and analysis
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { previewQuerySchema } from '../../types/requests';
import type { SessionContext } from '../middleware/session';
import { ApiError } from '../middleware/error';

/**
 * Create data preview routes
 *
 * @param sessionMiddleware - Session validation middleware
 * @returns Hono app with preview routes
 */
export function createPreviewRoutes(sessionMiddleware: unknown) {
    const preview = new Hono<SessionContext>();

    // All preview routes require authentication
    preview.use('*', sessionMiddleware as any);

    /**
     * POST /dp/data-preview
     *
     * Query table/view data with filters and sorting
     *
     * Request body: PreviewQuery
     * Response: { success: true, data: DataFrame }
     */
    preview.post('/dp/data-preview', async (c) => {
        const body = await c.req.json();

        // Validate request body
        const validation = previewQuerySchema.safeParse(body);
        if (!validation.success) {
            const issues = validation.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join(', ');
            throw new ApiError('VALIDATION_ERROR', `Invalid query: ${issues}`, 400);
        }

        const query = validation.data;
        const client = c.get('client');

        const [dataFrame, error] = await (client as {
            previewData: (query: unknown) => Promise<[unknown, Error | null]>;
        }).previewData(query);

        if (error) {
            throw new ApiError('UNKNOWN_ERROR', error.message, 500);
        }

        return c.json({
            success: true,
            data: dataFrame,
        });
    });

    /**
     * POST /dp/distinct-values
     *
     * Get distinct values for a column with counts
     *
     * Request body: { objectName: string, column: string }
     * Response: { success: true, data: DistinctResult }
     */
    preview.post('/dp/distinct-values', async (c) => {
        const body = await c.req.json();

        // Validate request body
        const schema = z.object({
            objectName: z.string().min(1),
            column: z.string().min(1),
        });

        const validation = schema.safeParse(body);
        if (!validation.success) {
            const issues = validation.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join(', ');
            throw new ApiError('VALIDATION_ERROR', `Invalid request: ${issues}`, 400);
        }

        const { objectName, column } = validation.data;
        const client = c.get('client');

        const [distinctResult, error] = await (client as {
            getDistinctValues: (objectName: string, column: string) => Promise<[unknown, Error | null]>;
        }).getDistinctValues(objectName, column);

        if (error) {
            throw new ApiError('UNKNOWN_ERROR', error.message, 500);
        }

        return c.json({
            success: true,
            data: distinctResult,
        });
    });

    /**
     * POST /dp/total-rows
     *
     * Get total row count for a table/view
     *
     * Request body: { objectName: string, objectType: 'table' | 'view' }
     * Response: { success: true, data: number }
     */
    preview.post('/dp/total-rows', async (c) => {
        const body = await c.req.json();

        // Validate request body
        const schema = z.object({
            objectName: z.string().min(1),
            objectType: z.enum(['table', 'view']),
        });

        const validation = schema.safeParse(body);
        if (!validation.success) {
            const issues = validation.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join(', ');
            throw new ApiError('VALIDATION_ERROR', `Invalid request: ${issues}`, 400);
        }

        const { objectName, objectType } = validation.data;
        const client = c.get('client');

        const [count, error] = await (client as {
            countRows: (objectName: string, objectType: string) => Promise<[number, Error | null]>;
        }).countRows(objectName, objectType);

        if (error) {
            throw new ApiError('UNKNOWN_ERROR', error.message, 500);
        }

        return c.json({
            success: true,
            data: count,
        });
    });

    return preview;
}
