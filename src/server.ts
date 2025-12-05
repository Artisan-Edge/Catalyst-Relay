/**
 * Catalyst-Relay HTTP Server
 *
 * Thin Hono wrapper around core functions.
 * Run with: bun run src/server.ts
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Health check
app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: Date.now() });
});

// TODO: Import and mount route modules
// app.route('/api', apiRoutes);

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

// Also export app for testing
export { app };
