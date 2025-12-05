/**
 * Server routes
 *
 * HTTP route handlers that wrap core functions.
 * Each route module exports a Hono app that can be mounted.
 */

import { Hono } from 'hono';

const routes = new Hono();

// TODO: Mount route modules
// routes.route('/auth', authRoutes);
// routes.route('/objects', objectRoutes);
// routes.route('/preview', previewRoutes);
// routes.route('/search', searchRoutes);

export { routes };
