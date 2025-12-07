import type { AuthStrategy } from '../types';

/**
 * SSO (Single Sign-On) authentication strategy
 *
 * Implements Kerberos/Windows authentication for SAP systems.
 * In production environments, this relies on system-level certificate
 * configuration and does not send explicit auth headers.
 *
 * NOTE: Full SSO implementation requires:
 * - Client certificate configuration
 * - Kerberos ticket handling
 * - Platform-specific system integration
 *
 * This is a placeholder implementation.
 * Production use requires additional certificate handling logic.
 */
export class SsoAuth implements AuthStrategy {
    readonly type = 'sso' as const;

    /**
     * Create an SSO Auth strategy
     * @param _certificate - Optional certificate path/data (reserved for future use)
     */
    constructor(_certificate?: string) {
        // Reserved for future certificate storage.
        // Current implementation relies on system-level SSO configuration.
    }

    /**
     * Get auth headers for SSO
     * @returns Empty object - SSO uses system-level authentication
     */
    getAuthHeaders(): Record<string, string> {
        return {};
    }
}
