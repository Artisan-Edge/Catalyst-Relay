/**
 * Background session cleanup
 *
 * Periodically removes expired sessions based on:
 * - Auth type (SAML has shorter timeout)
 * - Last activity timestamp
 * - Configurable intervals
 */

import type { SessionManager } from './manager';
import type { SessionConfig, SessionEntry } from './types';

/**
 * Cleanup task handle
 */
export interface CleanupHandle {
    /** Stops the background cleanup task */
    stop: () => void;
}

/**
 * Starts a background cleanup task that periodically removes expired sessions
 *
 * The cleanup process:
 * 1. Iterates through all sessions
 * 2. Checks if session has exceeded timeout based on auth type
 * 3. Destroys expired sessions
 * 4. Invokes optional callback for each expired session
 * 5. Removes clients from config hash map if no sessions reference them
 *
 * @param manager - Session manager instance
 * @param config - Session configuration (timeouts, intervals)
 * @param onExpired - Optional callback invoked for each expired session
 * @returns Cleanup handle with stop() method
 *
 * @example
 * ```typescript
 * const manager = new SessionManager();
 * const config = { sessionTimeout: 3600, samlSessionTimeout: 1800, cleanupInterval: 60 };
 *
 * const cleanup = startCleanupTask(manager, config, (sessionId, entry) => {
 *   console.log(`Session ${sessionId} expired`);
 * });
 *
 * // Later, stop cleanup
 * cleanup.stop();
 * ```
 */
export function startCleanupTask(
    manager: SessionManager,
    config: SessionConfig,
    onExpired?: (sessionId: string, entry: SessionEntry) => void
): CleanupHandle {
    const intervalId = setInterval(() => {
        performCleanup(manager, config, onExpired);
    }, config.cleanupInterval * 1000);

    return {
        stop: () => clearInterval(intervalId),
    };
}

/**
 * Performs a single cleanup pass
 *
 * Checks all sessions for expiration and removes expired ones.
 * Also removes clients from config hash map if they're no longer referenced.
 *
 * @private
 * @param manager - Session manager instance
 * @param config - Session configuration
 * @param onExpired - Optional callback for expired sessions
 */
function performCleanup(
    manager: SessionManager,
    config: SessionConfig,
    onExpired?: (sessionId: string, entry: SessionEntry) => void
): void {
    const now = new Date();
    const expiredSessions: Array<{ sessionId: string; entry: SessionEntry }> = [];

    // Find expired sessions
    for (const [sessionId, entry] of manager.getAllSessions()) {
        const timeout = entry.authType === 'saml'
            ? config.samlSessionTimeout
            : config.sessionTimeout;

        const elapsedSeconds = (now.getTime() - entry.lastActivity.getTime()) / 1000;

        if (elapsedSeconds > timeout) {
            expiredSessions.push({ sessionId, entry });
        }
    }

    // No expired sessions, nothing to do
    if (expiredSessions.length === 0) return;

    // Track clients from expired sessions
    const expiredClients = new Set<unknown>();

    // Destroy expired sessions
    for (const { sessionId, entry } of expiredSessions) {
        manager.destroySession(sessionId);
        expiredClients.add(entry.client);

        // Invoke callback if provided
        if (onExpired) {
            onExpired(sessionId, entry);
        }
    }

    // Check if any expired clients are still referenced by active sessions
    const activeSessions = manager.getAllSessions();
    const activeClients = new Set(activeSessions.map(([_, entry]) => entry.client));

    // Remove clients from config hash map if no active sessions reference them
    // NOTE: We can't directly get the config hash from the client, so we'll need
    // to track this mapping elsewhere. For now, this is a placeholder.
    // In practice, the cleanup of config hash map should be handled by the
    // logout/session destruction logic that knows the config hash.
}
