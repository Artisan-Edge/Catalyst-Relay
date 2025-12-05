/**
 * Session Manager
 *
 * Manages in-memory sessions with:
 * - Session ID generation and lifecycle
 * - Config hash deduplication (reuse clients for identical configs)
 * - Activity tracking for timeout management
 */

import { randomUUID } from 'crypto';
import type { AuthType } from '../../types';
import type { SessionEntry, SessionConfig } from './types';
import { DEFAULT_SESSION_CONFIG } from './types';

/**
 * Manages ADT client sessions in memory
 *
 * Features:
 * - Session ID to client mapping
 * - Config hash deduplication (multiple sessions can share same client)
 * - Activity timestamp tracking
 * - Session refresh and expiration
 *
 * @example
 * ```typescript
 * const manager = new SessionManager();
 *
 * // Register a client by config hash
 * manager.registerClient(configHash, client);
 *
 * // Create a new session
 * const sessionId = manager.createSession(configHash, client, 'basic');
 *
 * // Get session data
 * const entry = manager.getSession(sessionId);
 *
 * // Refresh activity timestamp
 * manager.refreshSession(sessionId);
 *
 * // Clean up
 * manager.destroySession(sessionId);
 * ```
 */
export class SessionManager {
    private sessionMap: Map<string, SessionEntry> = new Map();
    private configHashMap: Map<string, unknown> = new Map();
    private config: SessionConfig;

    constructor(config?: Partial<SessionConfig>) {
        this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
    }

    /**
     * Creates a new session for a client
     *
     * @param configHash - Configuration hash for client deduplication
     * @param client - ADT client instance
     * @param authType - Authentication type (affects timeout)
     * @returns Generated session ID
     */
    createSession(configHash: string, client: unknown, authType: AuthType): string {
        const sessionId = this.generateSessionId();

        this.sessionMap.set(sessionId, {
            client,
            lastActivity: new Date(),
            authType,
        });

        return sessionId;
    }

    /**
     * Retrieves session data by session ID
     *
     * @param sessionId - Session identifier
     * @returns Session entry or null if not found
     */
    getSession(sessionId: string): SessionEntry | null {
        return this.sessionMap.get(sessionId) ?? null;
    }

    /**
     * Updates the last activity timestamp for a session
     *
     * @param sessionId - Session identifier
     * @returns true if session was found and refreshed, false otherwise
     */
    refreshSession(sessionId: string): boolean {
        const entry = this.sessionMap.get(sessionId);

        if (!entry) return false;

        entry.lastActivity = new Date();
        return true;
    }

    /**
     * Destroys a session and removes it from the session map
     *
     * NOTE: Does not remove from config hash map - that's handled
     * by cleanup logic when no sessions reference the client
     *
     * @param sessionId - Session identifier
     * @returns true if session existed and was destroyed, false otherwise
     */
    destroySession(sessionId: string): boolean {
        return this.sessionMap.delete(sessionId);
    }

    /**
     * Retrieves a client by configuration hash
     *
     * @param configHash - Configuration hash
     * @returns Client instance or null if not found
     */
    getClientByHash(configHash: string): unknown | null {
        return this.configHashMap.get(configHash) ?? null;
    }

    /**
     * Registers a client with its configuration hash
     *
     * This allows multiple sessions to share the same client instance
     * when they have identical configurations.
     *
     * @param configHash - Configuration hash
     * @param client - ADT client instance
     */
    registerClient(configHash: string, client: unknown): void {
        this.configHashMap.set(configHash, client);
    }

    /**
     * Removes a client from the config hash map
     *
     * Should be called when no sessions reference the client anymore
     *
     * @param configHash - Configuration hash
     * @returns true if client existed and was removed, false otherwise
     */
    unregisterClient(configHash: string): boolean {
        return this.configHashMap.delete(configHash);
    }

    /**
     * Gets all active sessions
     *
     * @returns Array of [sessionId, entry] tuples
     */
    getAllSessions(): [string, SessionEntry][] {
        return Array.from(this.sessionMap.entries());
    }

    /**
     * Gets the session configuration
     *
     * @returns Session configuration
     */
    getConfig(): SessionConfig {
        return this.config;
    }

    /**
     * Generates a unique session ID using UUID v4
     *
     * @private
     * @returns UUID string
     */
    private generateSessionId(): string {
        return randomUUID();
    }
}
