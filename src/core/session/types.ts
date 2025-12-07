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
 *
 * Session timeouts vary by authentication type:
 * - Basic: 3 hours (SAP server default)
 * - SSO: 3 hours (certificate-based, same as basic)
 * - SAML: 30 minutes (IDP session typically shorter)
 */
export interface SessionConfig {
    /** Session timeout in seconds for Basic and SSO auth (default: 10800 = 3 hours) */
    sessionTimeout: number;
    /** Session timeout in seconds for SAML auth (default: 1800 = 30 minutes) */
    samlSessionTimeout: number;
    /** Cleanup interval in seconds (default: 60) */
    cleanupInterval: number;
}

/**
 * Default session configuration values
 */
export const DEFAULT_SESSION_CONFIG: SessionConfig = {
    sessionTimeout: 10800,        // 3 hours (Basic/SSO)
    samlSessionTimeout: 1800,     // 30 minutes (SAML)
    cleanupInterval: 60,          // 1 minute
};
