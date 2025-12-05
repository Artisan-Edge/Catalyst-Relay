/**
 * Core module - Pure business logic
 *
 * All functions in this module are runtime-agnostic and can be
 * imported directly by library consumers or wrapped by the HTTP server.
 */

// Re-export client
export { createClient } from './client';
export type { ADTClient } from './client';

// Re-export auth (when implemented)
// export * as auth from './auth';

// Re-export session
export * as session from './session';

// Re-export ADT operations
export * as adt from './adt';
