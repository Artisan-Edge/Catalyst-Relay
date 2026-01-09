/**
 * SAP Secure Login Server (SLS) client
 *
 * Handles communication with SLS for certificate enrollment:
 * 1. Authenticate using Kerberos SPNEGO
 * 2. Submit CSR to get signed certificate
 */

import { Agent, fetch as undiciFetch } from 'undici';
import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { SlsConfig, SlsAuthResponse, CertificateMaterial } from './types';
import { SLS_DEFAULTS } from './types';
import { getSpnegoToken, extractSpnFromUrl } from './kerberos';
import { generateKeypair, createCsr, getCurrentUsername } from './certificate';
import { parsePkcs7Certificates } from './pkcs7';

/**
 * Extended fetch options that support both Node.js (undici) and Bun
 *
 * Why this exists:
 * - In Python: `session.verify = False` disables SSL verification. Simple.
 * - In TypeScript: Different runtimes (Node.js vs Bun) disable SSL differently:
 *   - Node.js (undici): Uses `dispatcher` option with an Agent
 *   - Bun: Uses `tls: { rejectUnauthorized: false }` option (ignores undici's dispatcher)
 *
 * So we need to pass BOTH options to work in both environments.
 */
type ExtendedFetchOptions = Parameters<typeof undiciFetch>[1] & {
    tls?: { rejectUnauthorized: boolean };
};

/**
 * SLS client options
 */
interface SlsClientConfig {
    /** SLS configuration */
    config: SlsConfig;
    /** Skip SSL verification (required for most corporate environments) */
    insecure?: boolean;
}

/**
 * Enroll a client certificate from SLS
 *
 * Performs the full certificate enrollment flow:
 * 1. Authenticate to SLS using Kerberos SPNEGO
 * 2. Generate RSA keypair
 * 3. Create CSR with current username
 * 4. Submit CSR to SLS
 * 5. Parse PKCS#7 response to extract certificates
 *
 * @param options - SLS client configuration
 * @returns Certificate material (full chain + private key) or error
 *
 * @example
 * ```typescript
 * const [certs, error] = await enrollCertificate({
 *     config: { slsUrl: 'https://sapsso.corp.example.com' },
 *     insecure: true,
 * });
 *
 * if (error) {
 *     console.error('Enrollment failed:', error.message);
 *     return;
 * }
 *
 * // Use certificates for mTLS
 * const agent = new Agent({
 *     connect: {
 *         cert: certs.fullChain,
 *         key: certs.privateKey,
 *     }
 * });
 * ```
 */
export async function enrollCertificate(
    options: SlsClientConfig
): AsyncResult<CertificateMaterial> {
    const { config, insecure = false } = options;
    const profile = config.profile ?? SLS_DEFAULTS.PROFILE;

    // Create agent for Node.js SSL bypass (like Python's `session.verify = False`)
    // We also pass `insecure` flag separately for Bun compatibility (see ExtendedFetchOptions)
    const agent = insecure
        ? new Agent({ connect: { rejectUnauthorized: false } })
        : undefined;

    // Step 1: Authenticate with Kerberos (also captures session cookies)
    const [authResult, authErr] = await authenticateToSls(config, profile, agent, insecure);
    if (authErr) return err(authErr);

    // Step 2: Generate keypair
    const keySize = authResult.response.clientConfig.keySize ?? SLS_DEFAULTS.KEY_SIZE;
    const keypair = generateKeypair(keySize);

    // Step 3: Create CSR
    const username = getCurrentUsername();
    const csrDer = createCsr(keypair, username);

    // Step 4: Submit CSR and get certificate (pass cookies from auth step - like Python's session)
    const [certData, certErr] = await requestCertificate(config, profile, csrDer, authResult.cookies, agent, insecure);
    if (certErr) return err(certErr);

    // Step 5: Parse PKCS#7 response
    const [certs, parseErr] = parsePkcs7Certificates(certData);
    if (parseErr) return err(parseErr);

    return ok({
        fullChain: certs.fullChain,
        privateKey: keypair.privateKeyPem,
    });
}

/**
 * Result from SLS authentication, includes cookies for session persistence
 */
interface SlsAuthResult {
    response: SlsAuthResponse;
    cookies: string[];  // Cookies to pass to subsequent requests (like Python's session)
}

/**
 * Authenticate to SLS using Kerberos SPNEGO
 */
async function authenticateToSls(
    config: SlsConfig,
    profile: string,
    agent?: Agent,
    insecure: boolean = false
): AsyncResult<SlsAuthResult> {
    // Get SPNEGO token
    const spn = config.servicePrincipalName ?? extractSpnFromUrl(config.slsUrl);
    const [token, tokenErr] = await getSpnegoToken(spn);
    if (tokenErr) return err(tokenErr);

    // Build auth URL
    const authUrl = `${config.slsUrl}${SLS_DEFAULTS.LOGIN_ENDPOINT}?profile=${profile}`;

    try {
        const fetchOptions: ExtendedFetchOptions = {
            method: 'POST',
            headers: {
                'Authorization': `Negotiate ${token}`,
                'Accept': '*/*',
            },
        };

        // SSL bypass for Node.js - equivalent to Python's `session.verify = False`
        if (agent) {
            fetchOptions.dispatcher = agent;
        }

        // SSL bypass for Bun - same thing but Bun uses different option
        if (insecure) {
            fetchOptions.tls = { rejectUnauthorized: false };
        }

        const response = await undiciFetch(authUrl, fetchOptions);

        if (!response.ok) {
            const text = await response.text();
            return err(new Error(`SLS authentication failed: ${response.status} - ${text}`));
        }

        // Extract cookies from response - like Python's requests.Session() does automatically
        // These need to be passed to the certificate request
        const cookies: string[] = [];
        const setCookieHeader = response.headers.getSetCookie?.() ?? [];
        for (const cookie of setCookieHeader) {
            // Extract just the cookie name=value part (before the semicolon)
            const cookieValue = cookie.split(';')[0];
            if (cookieValue) {
                cookies.push(cookieValue);
            }
        }

        const authResponse = await response.json() as SlsAuthResponse;
        return ok({ response: authResponse, cookies });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return err(new Error(`SLS authentication request failed: ${message}`));
    }
}

/**
 * Request certificate from SLS by submitting CSR
 */
async function requestCertificate(
    config: SlsConfig,
    profile: string,
    csrDer: Buffer,
    cookies: string[],  // Session cookies from authentication (like Python's session)
    agent?: Agent,
    insecure: boolean = false
): AsyncResult<Buffer> {
    const certUrl = `${config.slsUrl}${SLS_DEFAULTS.CERTIFICATE_ENDPOINT}?profile=${profile}`;

    try {
        const fetchOptions: ExtendedFetchOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/pkcs10',
                'Content-Length': String(csrDer.length),
                'Accept': '*/*',
                // Pass cookies from auth step - like Python's requests.Session() does automatically
                ...(cookies.length > 0 && { 'Cookie': cookies.join('; ') }),
            },
            body: csrDer,
        };

        // SSL bypass for Node.js - equivalent to Python's `session.verify = False`
        if (agent) {
            fetchOptions.dispatcher = agent;
        }

        // SSL bypass for Bun - same thing but Bun uses different option
        if (insecure) {
            fetchOptions.tls = { rejectUnauthorized: false };
        }

        const response = await undiciFetch(certUrl, fetchOptions);

        if (!response.ok) {
            const text = await response.text();
            return err(new Error(`Certificate request failed: ${response.status} - ${text}`));
        }

        const buffer = await response.arrayBuffer();
        return ok(Buffer.from(buffer));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return err(new Error(`Certificate request failed: ${message}`));
    }
}
