import type { AsyncResult } from '../../types/result';

/**
 * Authentication type discriminator
 */
export type AuthType = 'basic' | 'saml' | 'sso';

/**
 * Cookie structure for authentication
 */
export interface AuthCookie {
    name: string;
    value: string;
    domain?: string;
    path?: string;
}

/**
 * Authentication strategy interface
 *
 * All auth implementations must conform to this interface.
 * Strategies can be stateful (e.g., storing cookies for SAML).
 */
export interface AuthStrategy {
    /** Authentication type identifier */
    readonly type: AuthType;

    /**
     * Get HTTP headers required for authentication
     * @returns Headers to include in requests
     */
    getAuthHeaders(): Record<string, string>;

    /**
     * Get cookies for authentication (optional)
     * @returns Array of cookies to set
     */
    getCookies?(): AuthCookie[];

    /**
     * Perform login if needed (optional)
     * Used for SAML headless browser automation
     * @param fetchFn - Fetch function to use for HTTP requests
     * @returns Success/error tuple
     */
    performLogin?(fetchFn: typeof fetch): AsyncResult<void, Error>;
}

/**
 * Basic authentication credentials
 */
export interface BasicAuthCredentials {
    username: string;
    password: string;
}
