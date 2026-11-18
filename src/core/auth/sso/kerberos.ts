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
import type { SpnegoTokenProvider } from '../../../types/config';
import { ok, err } from '../../../types/result';

// A hung SSPI/kinit call or token provider would otherwise stall login forever
const TOKEN_TIMEOUT_MS = 30_000;
const TIMED_OUT = Symbol('timedOut');

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
 * @param tokenProvider - Optional replacement for the kerberos package (e.g. a native helper exe)
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
export async function getSpnegoToken(
    servicePrincipalName: string,
    tokenProvider?: SpnegoTokenProvider
): AsyncResult<string> {
    // A caller-supplied provider replaces the kerberos package entirely
    if (tokenProvider) return getProvidedToken(servicePrincipalName, tokenProvider);

    const [kerberos, loadErr] = await loadKerberosModule();
    if (loadErr) return err(loadErr);

    try {
        // Initialize a client for the SPN, then step with an empty token to get the initial SPNEGO token
        const token = await withTimeout((async () => {
            const client = await kerberos.initializeClient(servicePrincipalName);
            return client.step('');
        })());

        if (token === TIMED_OUT) {
            return err(new Error(`Kerberos did not respond within ${TOKEN_TIMEOUT_MS / 1000}s`));
        }
        if (!token) {
            return err(new Error('Failed to generate SPNEGO token: empty response'));
        }

        return ok(token);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return err(new Error(`Kerberos authentication failed: ${message}`));
    }
}

// Ask the caller's provider for the token, trimming any trailing newline
async function getProvidedToken(
    servicePrincipalName: string,
    tokenProvider: SpnegoTokenProvider
): AsyncResult<string> {
    try {
        const provided = await withTimeout(tokenProvider(servicePrincipalName));
        if (provided === TIMED_OUT) {
            return err(new Error(`SSO token provider did not respond within ${TOKEN_TIMEOUT_MS / 1000}s`));
        }

        const token = provided.trim();
        if (!token) {
            return err(new Error('Failed to generate SPNEGO token: the token provider returned an empty token'));
        }
        return ok(token);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return err(new Error(`SPNEGO token provider failed: ${message}`));
    }
}

// Settle with the promise, or with TIMED_OUT once the timeout passes; the timer is cleared either way
async function withTimeout<T>(promise: Promise<T>): Promise<T | typeof TIMED_OUT> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), TOKEN_TIMEOUT_MS);
    });

    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timer);
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
