// Discovery routes — package/tree discovery and transport listing

import { Hono } from 'hono';
import { treeQuerySchema } from '../../types/requests';
import type { SessionContext } from '../middleware/session';
import { ApiError } from '../middleware/error';
import { formatZodError } from '../utils';

// Create discovery routes with session middleware
export function createDiscoveryRoutes(sessionMiddleware: unknown) {
    const discovery = new Hono<SessionContext>();

    // All discovery routes require authentication
    discovery.use('*', sessionMiddleware as any);

    // GET /package-discovery — List all available packages
    discovery.get('/package-discovery', async (c) => {
        const client = c.get('client');

        const [packages, error] = await (client as {
            getPackages: () => Promise<[unknown[], Error | null]>;
        }).getPackages();

        if (error) {
            throw new ApiError('UNKNOWN_ERROR', error.message, 500);
        }

        return c.json({
            success: true,
            data: packages,
        });
    });

    // POST /tree-discovery — Hierarchical tree for package browsing
    discovery.post('/tree-discovery', async (c) => {
        const body = await c.req.json();

        // Validate request body
        const validation = treeQuerySchema.safeParse(body);
        if (!validation.success) {
            throw new ApiError('VALIDATION_ERROR', `Invalid query: ${formatZodError(validation.error)}`, 400);
        }

        const query = validation.data;
        const client = c.get('client');

        const [tree, error] = await (client as {
            getTree: (query: unknown) => Promise<[unknown[], Error | null]>;
        }).getTree(query);

        if (error) {
            throw new ApiError('UNKNOWN_ERROR', error.message, 500);
        }

        return c.json({
            success: true,
            data: tree,
        });
    });

    // GET /transports/:package — List transport requests for package
    discovery.get('/transports/:package', async (c) => {
        const packageName = c.req.param('package');

        if (!packageName) {
            throw new ApiError('VALIDATION_ERROR', 'Package name is required', 400);
        }

        const client = c.get('client');

        const [transports, error] = await (client as {
            getTransports: (packageName: string) => Promise<[unknown[], Error | null]>;
        }).getTransports(packageName);

        if (error) {
            throw new ApiError('UNKNOWN_ERROR', error.message, 500);
        }

        return c.json({
            success: true,
            data: transports,
        });
    });

    return discovery;
}
