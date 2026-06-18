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
import { refreshHandler } from './auth/refresh';

// Discovery routes
import { packagesHandler } from './discovery/packages';
import { treeHandler } from './discovery/tree';
import { transportsHandler } from './discovery/transports';
import { createTransportHandler } from './discovery/createTransport';
import { deleteTransportHandler } from './discovery/deleteTransport';
import { removeFromTransportHandler } from './discovery/removeFromTransport';
import { objectConfigHandler } from './discovery/objectConfig';
import { viewTransportObjectsHandler } from './discovery/viewTransportObjects';
import { inactiveObjectsHandler } from './discovery/inactiveObjects';

// Objects routes
import { readHandler } from './objects/read';
import { upsertHandler } from './objects/upsert';
import { classIncludeHandler } from './objects/classInclude';
import { activateHandler } from './objects/activate';
import { checkHandler } from './objects/check';
import { deleteHandler } from './objects/delete';

// Preview routes
import { dataHandler } from './preview/data';
import { distinctHandler } from './preview/distinct';
import { countHandler } from './preview/count';
import { freestyleHandler } from './preview/freestyle';

// Search routes
import { searchHandler } from './search/search';
import { whereUsedHandler } from './search/whereUsed';

// Diff routes
import { gitDiffHandler } from './diff/gitDiff';

// Business services routes
import { createServiceBindingHandler } from './businessservices/createServiceBinding';

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
    app.post('/session/refresh', sessionMiddleware, refreshHandler());

    // ─────────────────────────────────────────────────────────────────────────
    // Discovery Routes (session required, except object-config)
    // ─────────────────────────────────────────────────────────────────────────

    app.get('/object-config', objectConfigHandler); // No session required - static config
    app.get('/packages', sessionMiddleware, packagesHandler);
    app.post('/tree', sessionMiddleware, treeHandler);
    app.get('/transports/:package', sessionMiddleware, transportsHandler);
    app.post('/transports', sessionMiddleware, createTransportHandler);
    app.delete('/transports/:transportId', sessionMiddleware, deleteTransportHandler);
    app.put('/transports/:transportId/objects', sessionMiddleware, removeFromTransportHandler);
    app.get('/transports/:transportId/objects', sessionMiddleware, viewTransportObjectsHandler);
    app.get('/inactive-objects', sessionMiddleware, inactiveObjectsHandler);

    // ─────────────────────────────────────────────────────────────────────────
    // Object CRAUD Routes (session required)
    // ─────────────────────────────────────────────────────────────────────────

    app.post('/objects/read', sessionMiddleware, readHandler);
    app.post('/objects/upsert/:package/:transport?', sessionMiddleware, upsertHandler);
    app.post('/objects/class-include', sessionMiddleware, classIncludeHandler);
    app.post('/objects/activate', sessionMiddleware, activateHandler);
    app.post('/objects/check', sessionMiddleware, checkHandler);
    app.delete('/objects/:transport?', sessionMiddleware, deleteHandler);

    // ─────────────────────────────────────────────────────────────────────────
    // Data Preview Routes (session required)
    // ─────────────────────────────────────────────────────────────────────────

    app.post('/preview/data', sessionMiddleware, dataHandler);
    app.post('/preview/distinct', sessionMiddleware, distinctHandler);
    app.post('/preview/count', sessionMiddleware, countHandler);
    app.post('/preview/freestyle', sessionMiddleware, freestyleHandler);

    // ─────────────────────────────────────────────────────────────────────────
    // Search Routes (session required)
    // ─────────────────────────────────────────────────────────────────────────

    app.post('/search/:query', sessionMiddleware, searchHandler);
    app.post('/where-used', sessionMiddleware, whereUsedHandler);

    // ─────────────────────────────────────────────────────────────────────────
    // Diff Routes (session required)
    // ─────────────────────────────────────────────────────────────────────────

    app.post('/git-diff', sessionMiddleware, gitDiffHandler);

    // ─────────────────────────────────────────────────────────────────────────
    // Business Services Routes (session required)
    // ─────────────────────────────────────────────────────────────────────────

    app.post('/businessservices/bindings', sessionMiddleware, createServiceBindingHandler);

    return app;
}

// Re-export types for consumers
export type { ISessionManager, SessionContext, RouteContext } from './types';
export type { SuccessResponse, ErrorResponse, ApiResponse } from './types';
