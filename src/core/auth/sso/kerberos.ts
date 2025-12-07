/**
 * Kerberos SPNEGO token generation
 *
 * Generates SPNEGO tokens for authenticating to SAP Secure Login Server.
 * Uses the kerberos npm package (optional peer dependency).
 *
 * Platform support:
 * - Windows: Uses SSPI (native Windows authentication)
 * - Linux/macOS: Uses MIT Kerberos (requires kinit)
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';

/**
 * Kerberos client interface matching the kerberos npm package
 */
interface KerberosClient {
    step(token: string): Promise<string | null>;
    wrap(message: string, options?: unknown): Promise<string>;
    unwrap(message: string): Promise<string>;
}

/**
 * Kerberos module interface
 */
interface KerberosModule {
    initializeClient(
        service: string,
        options?: { mechOID?: string }
    ): Promise<KerberosClient>;
}

/**
 * Lazily load kerberos module
 *
 * @returns Kerberos module or null if not installed
 */
async function loadKerberosModule(): AsyncResult<KerberosModule> {
    try {
        // Dynamic import to avoid hard dependency
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const kerberosModule = require('kerberos') as KerberosModule;
        return ok(kerberosModule);
    } catch {
        return err(new Error(
            'kerberos package is not installed. ' +
            'Install it with: npm install kerberos'
        ));
    }
}

/**
 * Generate SPNEGO token for Kerberos authentication
 *
 * Creates a base64-encoded SPNEGO token that can be used in
 * Authorization: Negotiate headers for authenticating to SLS.
 *
 * @param servicePrincipalName - SPN to authenticate to (e.g., HTTP/sapsso.corp.example.com)
 * @returns Base64-encoded SPNEGO token or error
 *
 * @example
 * ```typescript
 * const [token, error] = await getSpnegoToken('HTTP/sapsso.corp.example.com');
 * if (error) {
 *     console.error('Failed to get SPNEGO token:', error.message);
 *     return;
 * }
 *
 * // Use in Authorization header
 * fetch(url, {
 *     headers: {
 *         Authorization: `Negotiate ${token}`
 *     }
 * });
 * ```
 */
export async function getSpnegoToken(servicePrincipalName: string): AsyncResult<string> {
    const [kerberos, loadErr] = await loadKerberosModule();
    if (loadErr) return err(loadErr);

    try {
        // Initialize Kerberos client for the given SPN
        const client = await kerberos.initializeClient(servicePrincipalName);

        // Step with empty token to get initial SPNEGO token
        const token = await client.step('');

        if (!token) {
            return err(new Error('Failed to generate SPNEGO token: empty response'));
        }

        return ok(token);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return err(new Error(`Kerberos authentication failed: ${message}`));
    }
}

/**
 * Extract SPN from SLS URL
 *
 * Generates HTTP service principal name from the SLS URL hostname.
 *
 * @param slsUrl - SLS server URL
 * @returns Service principal name (e.g., HTTP/hostname.example.com)
 *
 * @example
 * ```typescript
 * const spn = extractSpnFromUrl('https://sapsso.corp.example.com:443');
 * // Returns: 'HTTP/sapsso.corp.example.com'
 * ```
 */
export function extractSpnFromUrl(slsUrl: string): string {
    const url = new URL(slsUrl);
    return `HTTP/${url.hostname}`;
}
