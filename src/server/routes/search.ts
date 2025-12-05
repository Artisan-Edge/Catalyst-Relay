/**
 * Search routes
 *
 * Handles object search and where-used dependency analysis
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { objectRefSchema } from '../../types/requests';
import type { SessionContext } from '../middleware/session';
import { ApiError } from '../middleware/error';

/**
 * Create search routes
 *
 * @param sessionMiddleware - Session validation middleware
 * @returns Hono app with search routes
 */
export function createSearchRoutes(sessionMiddleware: unknown) {
    const search = new Hono<SessionContext>();

    // All search routes require authentication
    search.use('*', sessionMiddleware as any);

    /**
     * POST /search/:query
     *
     * Search for objects by name/pattern
     *
     * Request body: string[] (array of types)
     * Response: { success: true, data: SearchResult[] }
     */
    search.post('/search/:query', async (c) => {
        const query = c.req.param('query');

        if (!query) {
            throw new ApiError('VALIDATION_ERROR', 'Search query is required', 400);
        }

        const body = await c.req.json();

        // Validate array of types
        const schema = z.array(z.string());
        const validation = schema.safeParse(body);

        if (!validation.success) {
            const issues = validation.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join(', ');
            throw new ApiError('VALIDATION_ERROR', `Invalid types array: ${issues}`, 400);
        }

        const types = validation.data;
        const client = c.get('client');

        const [results, error] = await (client as {
            search: (query: string, types?: string[]) => Promise<[unknown[], Error | null]>;
        }).search(query, types.length > 0 ? types : undefined);

        if (error) {
            throw new ApiError('UNKNOWN_ERROR', error.message, 500);
        }

        return c.json({
            success: true,
            data: results,
        });
    });

    /**
     * POST /where-used
     *
     * Find where objects are used (dependencies) - batch operation
     *
     * Request body: ObjectRef[]
     * Response: { success: true, data: Dependency[][] }
     */
    search.post('/where-used', async (c) => {
        const body = await c.req.json();

        // Validate array of object refs
        const schema = z.array(objectRefSchema);
        const validation = schema.safeParse(body);

        if (!validation.success) {
            const issues = validation.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join(', ');
            throw new ApiError('VALIDATION_ERROR', `Invalid object references: ${issues}`, 400);
        }

        const objectRefs = validation.data;
        const client = c.get('client');

        // Process all where-used queries in parallel
        const results = await Promise.all(
            objectRefs.map(async (objectRef) => {
                const [dependencies, error] = await (client as {
                    whereUsed: (object: unknown) => Promise<[unknown[], Error | null]>;
                }).whereUsed(objectRef);

                if (error) {
                    throw new ApiError('UNKNOWN_ERROR', error.message, 500);
                }

                return dependencies;
            })
        );

        return c.json({
            success: true,
            data: results,
        });
    });

    return search;
}
