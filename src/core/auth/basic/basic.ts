import type { AuthStrategy } from '../types';

/**
 * Basic authentication strategy
 *
 * Implements HTTP Basic Auth using username/password credentials.
 * Credentials are base64-encoded and sent in the Authorization header.
 *
 * Reference: RFC 7617
 */
export class BasicAuth implements AuthStrategy {
    readonly type = 'basic' as const;
    private authHeader: string;

    /**
     * Create a Basic Auth strategy
     * @param username - SAP username
     * @param password - SAP password
     */
    constructor(username: string, password: string) {
        if (!username || !password) {
            throw new Error('BasicAuth requires both username and password');
        }

        const credentials = `${username}:${password}`;
        const encoded = btoa(credentials);
        this.authHeader = `Basic ${encoded}`;
    }

    /**
     * Get Authorization header with Basic credentials
     * @returns Headers object with Authorization field
     */
    getAuthHeaders(): Record<string, string> {
        return {
            Authorization: this.authHeader,
        };
    }
}
