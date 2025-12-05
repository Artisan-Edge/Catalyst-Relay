/**
 * Session management module
 *
 * Handles in-memory session storage with:
 * - Configurable timeouts
 * - Background cleanup
 * - Config hash deduplication
 * - Login/logout/session lifecycle operations
 */

export { SessionManager } from './manager';
export { hashConnectionConfig } from './hash';
export { startCleanupTask } from './cleanup';
export type { SessionEntry, SessionConfig } from './types';
export type { CleanupHandle } from './cleanup';
export { DEFAULT_SESSION_CONFIG } from './types';
export { login, logout, sessionReset, fetchCsrfToken } from './login';
export type { SessionState } from './login';
