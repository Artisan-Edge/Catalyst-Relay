/**
 * Catalyst-Relay HTTP Server
 *
 * Thin Hono wrapper around core functions.
 * Run with: bun run src/server.ts
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { SessionManager } from './core/session/manager';
import { startCleanupTask } from './core/session/cleanup';
import { createSessionMiddleware, errorMiddleware } from './server/middleware';
import { createRoutes } from './server/routes';
import type { ISessionManager } from './server/routes';

const app = new Hono();

// Create session manager (cast to ISessionManager for proper typing)
const sessionManager = new SessionManager() as unknown as ISessionManager;

// Start background cleanup task
const cleanupHandle = startCleanupTask(
    sessionManager as unknown as SessionManager,
    (sessionManager as unknown as SessionManager).getConfig(),
    (sessionId, entry) => {
        console.log(`Session ${sessionId} expired after inactivity`);
    }
);

// Create session middleware
const sessionMiddleware = createSessionMiddleware(sessionManager);

// Global middleware
app.use('*', logger());
app.use('*', cors());
app.use('*', errorMiddleware);

// Health check
app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: Date.now() });
});

// Mount all API routes
const routes = createRoutes(sessionManager, sessionMiddleware);
app.route('/', routes);

// 404 handler
app.notFound((c) => {
    return c.json({ success: false, error: 'Not found' }, 404);
});

// Error handler
app.onError((error, c) => {
    console.error('Unhandled error:', error);
    return c.json(
        {
            success: false,
            error: 'Internal server error',
            code: 'UNKNOWN_ERROR',
        },
        500
    );
});

// Start server
const port = Number(process.env['PORT']) || 3000;

console.log(`Starting Catalyst-Relay server on port ${port}`);

// Use standard fetch API export for runtime compatibility
export default {
    port,
    fetch: app.fetch,
};

// Also export app and session manager for testing
export { app, sessionManager, cleanupHandle };
