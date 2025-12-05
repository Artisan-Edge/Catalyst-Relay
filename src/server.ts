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
import {
    createAuthRoutes,
    createDiscoveryRoutes,
    createObjectRoutes,
    createPreviewRoutes,
    createSearchRoutes,
} from './server/routes';

const app = new Hono();

// Create session manager
const sessionManager = new SessionManager();

// Start background cleanup task
const cleanupHandle = startCleanupTask(
    sessionManager,
    sessionManager.getConfig(),
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

// Mount route modules
const authRoutes = createAuthRoutes(sessionManager, sessionMiddleware);
const discoveryRoutes = createDiscoveryRoutes(sessionMiddleware);
const objectRoutes = createObjectRoutes(sessionMiddleware);
const previewRoutes = createPreviewRoutes(sessionMiddleware);
const searchRoutes = createSearchRoutes(sessionMiddleware);

// Auth routes (no prefix)
app.route('/', authRoutes);

// Discovery routes (mounted at root with specific paths)
app.route('/', discoveryRoutes);

// Object CRAUD routes
app.route('/objects', objectRoutes);

// Data preview routes (mounted at root since routes have /dp prefix)
app.route('/', previewRoutes);

// Search routes (mounted at root for /where-used and /search paths)
app.route('/', searchRoutes);

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
