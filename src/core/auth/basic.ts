import type { AuthStrategy } from './types';

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
        // Validate inputs.
        if (!username || !password) {
            throw new Error('BasicAuth requires both username and password');
        }

        // Build credentials string.
        const credentials = `${username}:${password}`;

        // Encode credentials as base64.
        // NOTE: btoa() is available in Node.js 16+ and all modern browsers
        const encoded = btoa(credentials);

        // Store authorization header.
        this.authHeader = `Basic ${encoded}`;
    }

    /**
     * Get Authorization header with Basic credentials
     * @returns Headers object with Authorization field
     */
    getAuthHeaders(): Record<string, string> {
        // Return pre-built authorization header.
        return {
            'Authorization': this.authHeader,
        };
    }
}
