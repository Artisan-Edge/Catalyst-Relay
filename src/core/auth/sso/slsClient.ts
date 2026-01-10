/**
 * SAP Secure Login Server (SLS) client
 *
 * Handles communication with SLS for certificate enrollment:
 * 1. Authenticate using Kerberos SPNEGO
 * 2. Submit CSR to get signed certificate
 *
 * Uses Node.js https module for all HTTP requests (same as client.ts)
 * for consistent behavior across Node.js, Electron (VS Code), and Bun.
 */

import * as https from 'https';
import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { SlsConfig, SlsAuthResponse, CertificateMaterial } from './types';
import { SLS_DEFAULTS } from './types';
import { getSpnegoToken, extractSpnFromUrl } from './kerberos';
import { generateKeypair, createCsr, getCurrentUsername } from './certificate';
import { parsePkcs7Certificates } from './pkcs7';

/**
 * Make HTTP request using Node.js https module.
 * Same approach as client.ts for consistency.
 */
async function httpsRequest(
    url: string,
    options: {
        method: string;
        headers: Record<string, string>;
        body?: Buffer | undefined;
        rejectUnauthorized?: boolean | undefined;
    }
): Promise<{ status: number; headers: Record<string, string | string[]>; body: Buffer; cookies: string[] }> {
    const urlObj = new URL(url);

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: urlObj.pathname + urlObj.search,
            method: options.method,
            headers: options.headers,
            rejectUnauthorized: options.rejectUnauthorized ?? true,
        }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks);

                // Extract cookies from set-cookie headers
                const cookies: string[] = [];
                const setCookieHeader = res.headers['set-cookie'];
                if (setCookieHeader) {
                    for (const cookie of setCookieHeader) {
                        const cookieValue = cookie.split(';')[0];
                        if (cookieValue) {
                            cookies.push(cookieValue);
                        }
                    }
                }

                resolve({
                    status: res.statusCode || 0,
                    headers: res.headers as Record<string, string | string[]>,
                    body,
                    cookies,
                });
            });
        });

        req.on('error', reject);

        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

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
 * ```
 */
export async function enrollCertificate(
    options: SlsClientConfig
): AsyncResult<CertificateMaterial> {
    const { config, insecure = false } = options;
    const profile = config.profile ?? SLS_DEFAULTS.PROFILE;

    // Step 1: Authenticate with Kerberos (also captures session cookies)
    const [authResult, authErr] = await authenticateToSls(config, profile, insecure);
    if (authErr) return err(authErr);

    // Step 2: Generate keypair
    const keySize = authResult.response.clientConfig.keySize ?? SLS_DEFAULTS.KEY_SIZE;
    const keypair = generateKeypair(keySize);

    // Step 3: Create CSR
    const username = getCurrentUsername();
    const csrDer = createCsr(keypair, username);

    // Step 4: Submit CSR and get certificate (pass cookies from auth step - like Python's session)
    const [certData, certErr] = await requestCertificate(config, profile, csrDer, authResult.cookies, insecure);
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
    insecure: boolean = false
): AsyncResult<SlsAuthResult> {
    // Get SPNEGO token
    const spn = config.servicePrincipalName ?? extractSpnFromUrl(config.slsUrl);
    const [token, tokenErr] = await getSpnegoToken(spn);
    if (tokenErr) return err(tokenErr);

    // Build auth URL
    const authUrl = `${config.slsUrl}${SLS_DEFAULTS.LOGIN_ENDPOINT}?profile=${profile}`;

    try {
        const response = await httpsRequest(authUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Negotiate ${token}`,
                'Accept': '*/*',
            },
            rejectUnauthorized: !insecure,
        });

        if (response.status < 200 || response.status >= 300) {
            const text = response.body.toString('utf-8');
            return err(new Error(`SLS authentication failed: ${response.status} - ${text}`));
        }

        const authResponse = JSON.parse(response.body.toString('utf-8')) as SlsAuthResponse;
        return ok({ response: authResponse, cookies: response.cookies });
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
    insecure: boolean = false
): AsyncResult<Buffer> {
    const certUrl = `${config.slsUrl}${SLS_DEFAULTS.CERTIFICATE_ENDPOINT}?profile=${profile}`;

    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/pkcs10',
            'Content-Length': String(csrDer.length),
            'Accept': '*/*',
        };

        // Pass cookies from auth step - like Python's requests.Session() does automatically
        if (cookies.length > 0) {
            headers['Cookie'] = cookies.join('; ');
        }

        const response = await httpsRequest(certUrl, {
            method: 'POST',
            headers,
            body: csrDer,
            rejectUnauthorized: !insecure,
        });

        if (response.status < 200 || response.status >= 300) {
            const text = response.body.toString('utf-8');
            return err(new Error(`Certificate request failed: ${response.status} - ${text}`));
        }

        return ok(response.body);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return err(new Error(`Certificate request failed: ${message}`));
    }
}
