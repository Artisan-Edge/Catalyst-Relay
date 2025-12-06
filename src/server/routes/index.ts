/**
 * Route Wiring
 *
 * Registers all routes with the Hono app. Each route file contains:
 * - Colocated request/response schemas
 * - Single handler function
 *
 * Pattern inspired by SNAP-API Python project: one file per route.
 */

import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { ISessionManager, SessionContext } from './types';

// Auth routes
import { loginHandler } from './auth/login';
import { logoutHandler } from './auth/logout';

// Discovery routes
import { packagesHandler } from './discovery/packages';
import { treeHandler } from './discovery/tree';
import { transportsHandler } from './discovery/transports';

// Objects routes
import { readHandler } from './objects/read';
import { upsertHandler } from './objects/upsert';
import { activateHandler } from './objects/activate';
import { deleteHandler } from './objects/delete';

// Preview routes
import { dataHandler } from './preview/data';
import { distinctHandler } from './preview/distinct';
import { countHandler } from './preview/count';

// Search routes
import { searchHandler } from './search/search';
import { whereUsedHandler } from './search/whereUsed';

/**
 * Creates and configures all API routes
 *
 * @param sessionManager - Session manager instance
 * @param sessionMiddleware - Middleware that validates session and attaches client to context
 * @returns Configured Hono app with all routes
 */
export function createRoutes(
    sessionManager: ISessionManager,
    sessionMiddleware: MiddlewareHandler<SessionContext>
) {
    const app = new Hono<SessionContext>();

    // ─────────────────────────────────────────────────────────────────────────
    // Auth Routes (no session required for login)
    // ─────────────────────────────────────────────────────────────────────────

    app.post('/login', loginHandler(sessionManager));
    app.delete('/logout', sessionMiddleware, logoutHandler(sessionManager));

    // ─────────────────────────────────────────────────────────────────────────
    // Discovery Routes (session required)
    // ─────────────────────────────────────────────────────────────────────────

    app.get('/packages', sessionMiddleware, packagesHandler);
    app.post('/tree', sessionMiddleware, treeHandler);
    app.get('/transports/:package', sessionMiddleware, transportsHandler);

    // ─────────────────────────────────────────────────────────────────────────
    // Object CRAUD Routes (session required)
    // ─────────────────────────────────────────────────────────────────────────

    app.post('/objects/read', sessionMiddleware, readHandler);
    app.post('/objects/upsert/:package/:transport?', sessionMiddleware, upsertHandler);
    app.post('/objects/activate', sessionMiddleware, activateHandler);
    app.delete('/objects/:transport?', sessionMiddleware, deleteHandler);

    // ─────────────────────────────────────────────────────────────────────────
    // Data Preview Routes (session required)
    // ─────────────────────────────────────────────────────────────────────────

    app.post('/preview/data', sessionMiddleware, dataHandler);
    app.post('/preview/distinct', sessionMiddleware, distinctHandler);
    app.post('/preview/count', sessionMiddleware, countHandler);

    // ─────────────────────────────────────────────────────────────────────────
    // Search Routes (session required)
    // ─────────────────────────────────────────────────────────────────────────

    app.post('/search/:query', sessionMiddleware, searchHandler);
    app.post('/where-used', sessionMiddleware, whereUsedHandler);

    return app;
}

// Re-export types for consumers
export type { ISessionManager, SessionContext, RouteContext } from './types';
export type { SuccessResponse, ErrorResponse, ApiResponse } from './types';
