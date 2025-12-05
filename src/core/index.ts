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

// Re-export session (when implemented)
// export * as session from './session';

// Re-export ADT operations (when implemented)
// export * as adt from './adt';
