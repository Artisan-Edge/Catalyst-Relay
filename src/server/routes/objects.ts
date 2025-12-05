/**
 * Object CRAUD routes
 *
 * Handles Create, Read, Activate, Update, Delete operations
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { objectRefSchema, objectContentSchema } from '../../types/requests';
import type { SessionContext } from '../middleware/session';
import { ApiError } from '../middleware/error';

/**
 * Create object CRAUD routes
 *
 * @param sessionMiddleware - Session validation middleware
 * @returns Hono app with object routes
 */
export function createObjectRoutes(sessionMiddleware: unknown) {
    const objects = new Hono<SessionContext>();

    // All object routes require authentication
    objects.use('*', sessionMiddleware as any);

    /**
     * POST /objects/read
     *
     * Batch read objects with content
     *
     * Request body: ObjectRef[]
     * Response: { success: true, data: ObjectWithContent[] }
     */
    objects.post('/read', async (c) => {
        const body = await c.req.json();

        // Validate array of object refs
        const schema = z.array(objectRefSchema);
        const validation = schema.safeParse(body);

        if (!validation.success) {
            const issues = validation.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join(', ');
            throw new ApiError('VALIDATION_ERROR', `Invalid objects: ${issues}`, 400);
        }

        const objectRefs = validation.data;
        const client = c.get('client');

        const [results, error] = await (client as {
            read: (objects: unknown[]) => Promise<[unknown[], Error | null]>;
        }).read(objectRefs);

        if (error) {
            throw new ApiError('UNKNOWN_ERROR', error.message, 500);
        }

        return c.json({
            success: true,
            data: results,
        });
    });

    /**
     * POST /objects/upsert/:package/:transport
     *
     * Create or update objects in a package/transport
     *
     * Request body: ObjectContent[]
     * Response: { success: true, data: UpsertResult[] }
     */
    objects.post('/upsert/:package/:transport', async (c) => {
        const packageName = c.req.param('package');
        const transport = c.req.param('transport');

        if (!packageName) {
            throw new ApiError('VALIDATION_ERROR', 'Package name is required', 400);
        }

        // Transport validation
        if (packageName !== '$TMP' && !transport) {
            throw new ApiError(
                'TRANSPORT_REQUIRED',
                `Transport required for non-temporary package ${packageName}`,
                400
            );
        }

        const body = await c.req.json();

        // Validate array of object contents
        const schema = z.array(objectContentSchema);
        const validation = schema.safeParse(body);

        if (!validation.success) {
            const issues = validation.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join(', ');
            throw new ApiError('VALIDATION_ERROR', `Invalid objects: ${issues}`, 400);
        }

        const objectContents = validation.data;
        const client = c.get('client');

        const [results, error] = await (client as {
            upsert: (objects: unknown[], transport: string) => Promise<[unknown[], Error | null]>;
        }).upsert(objectContents, transport || '');

        if (error) {
            throw new ApiError('UNKNOWN_ERROR', error.message, 500);
        }

        return c.json({
            success: true,
            data: results,
        });
    });

    /**
     * POST /objects/activate
     *
     * Activate objects (make them runtime-available)
     *
     * Request body: ObjectRef[]
     * Response: { success: true, data: ActivationResult[] }
     */
    objects.post('/activate', async (c) => {
        const body = await c.req.json();

        // Validate array of object refs
        const schema = z.array(objectRefSchema);
        const validation = schema.safeParse(body);

        if (!validation.success) {
            const issues = validation.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join(', ');
            throw new ApiError('VALIDATION_ERROR', `Invalid objects: ${issues}`, 400);
        }

        const objectRefs = validation.data;
        const client = c.get('client');

        const [results, error] = await (client as {
            activate: (objects: unknown[]) => Promise<[unknown[], Error | null]>;
        }).activate(objectRefs);

        if (error) {
            throw new ApiError('ACTIVATION_FAILED', error.message, 500);
        }

        return c.json({
            success: true,
            data: results,
        });
    });

    /**
     * DELETE /objects/:transport
     *
     * Delete objects from a transport
     *
     * Request body: ObjectRef[]
     * Response: { success: true, data: null }
     */
    objects.delete('/:transport', async (c) => {
        const transport = c.req.param('transport');
        const body = await c.req.json();

        // Validate array of object refs
        const schema = z.array(objectRefSchema);
        const validation = schema.safeParse(body);

        if (!validation.success) {
            const issues = validation.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join(', ');
            throw new ApiError('VALIDATION_ERROR', `Invalid objects: ${issues}`, 400);
        }

        const objectRefs = validation.data;
        const client = c.get('client');

        const [, error] = await (client as {
            delete: (objects: unknown[], transport?: string) => Promise<[void, Error | null]>;
        }).delete(objectRefs, transport || undefined);

        if (error) {
            throw new ApiError('UNKNOWN_ERROR', error.message, 500);
        }

        return c.json({
            success: true,
            data: null,
        });
    });

    return objects;
}
