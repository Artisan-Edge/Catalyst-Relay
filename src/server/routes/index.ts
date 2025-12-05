/**
 * Server routes
 *
 * HTTP route handlers that wrap core functions.
 * Each route module exports a Hono app that can be mounted.
 */

export { createAuthRoutes } from './auth';
export { createDiscoveryRoutes } from './discovery';
export { createObjectRoutes } from './objects';
export { createPreviewRoutes } from './preview';
export { createSearchRoutes } from './search';
