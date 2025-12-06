/**
 * Session management type definitions
 */

import type { AuthType } from '../../types';

/**
 * Session data returned after successful login
 */
export interface Session {
    /** Unique session identifier */
    sessionId: string;
    /** Authenticated username */
    username: string;
    /** Session expiration timestamp */
    expiresAt: number;
}

/**
 * Session entry stored in memory
 */
export interface SessionEntry {
    /** The ADT client instance (typed as unknown until client is implemented) */
    client: unknown;
    /** Last activity timestamp for timeout tracking */
    lastActivity: Date;
    /** Authentication type used for this session */
    authType: AuthType;
}

/**
 * Configuration for session manager
 */
export interface SessionConfig {
    /** Session timeout in seconds for basic/SSO (default: 10800 = 3 hours) */
    sessionTimeout: number;
    /** Session timeout in seconds for SAML (default: 1800 = 30 minutes) */
    samlSessionTimeout: number;
    /** Cleanup interval in seconds (default: 60) */
    cleanupInterval: number;
}

/**
 * Default session configuration values
 */
export const DEFAULT_SESSION_CONFIG: SessionConfig = {
    sessionTimeout: 10800,        // 3 hours
    samlSessionTimeout: 1800,     // 30 minutes
    cleanupInterval: 60,          // 1 minute
};
