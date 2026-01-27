/**
 * HTTP utilities for ADT client
 */

import * as http from 'http';
import * as https from 'https';
import type { HttpRequestOptions } from './types';

export const MAX_REDIRECTS = 5;
export const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Make HTTP request using Node.js http/https modules.
 *
 * Why http/https modules instead of undici/fetch:
 * - Undici doesn't work with mTLS client certificates (tested, fails with "unable to get local issuer certificate")
 * - Node.js https module works reliably with mTLS in all environments (Node.js, Electron, Bun)
 * - Simpler to maintain one implementation that works everywhere
 */
export async function httpRequest(
    url: string,
    options: HttpRequestOptions,
    redirectCount = 0
): Promise<Response> {
    if (redirectCount > MAX_REDIRECTS) {
        throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
    }

    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const requestFn = isHttps ? https.request : http.request;
    const defaultPort = isHttps ? 443 : 80;

    return new Promise((resolve, reject) => {
        const req = requestFn({
            hostname: urlObj.hostname,
            port: urlObj.port || defaultPort,
            path: urlObj.pathname + urlObj.search,
            method: options.method,
            headers: options.headers,
            cert: options.cert,
            key: options.key,
            rejectUnauthorized: options.rejectUnauthorized ?? true,
            timeout: options.timeout,
        }, (res) => {
            const statusCode = res.statusCode || 0;

            // Handle redirects
            if (REDIRECT_STATUSES.has(statusCode) && res.headers.location) {
                const redirectUrl = new URL(res.headers.location, url).toString();
                // For 303, always use GET; for 307/308, preserve method
                const redirectMethod = statusCode === 303 ? 'GET' : options.method;
                const redirectBody = statusCode === 303 ? undefined : options.body;

                httpRequest(redirectUrl, { ...options, method: redirectMethod, body: redirectBody }, redirectCount + 1)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            const chunks: Buffer[] = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf-8');
                // Convert to web Response
                const headers = new Headers();
                for (const [key, value] of Object.entries(res.headers)) {
                    if (value) {
                        if (Array.isArray(value)) {
                            value.forEach(v => headers.append(key, v));
                        } else {
                            headers.set(key, value);
                        }
                    }
                }
                resolve(new Response(body, {
                    status: statusCode,
                    statusText: res.statusMessage || '',
                    headers,
                }));
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

// Build URL search parameters with sap-client
export function buildParams(
    baseParams: Record<string, string | number> | undefined,
    clientNum: string
): URLSearchParams {
    const params = new URLSearchParams();

    // Add any custom parameters from the request.
    if (baseParams) {
        for (const [key, value] of Object.entries(baseParams)) {
            params.append(key, String(value));
        }
    }

    // Always append sap-client parameter.
    params.append('sap-client', clientNum);

    return params;
}

// Build full URL from base URL and path
export function buildUrl(baseUrl: string, path: string, params?: URLSearchParams): string {
    // Construct URL from base and path.
    const url = new URL(path, baseUrl);

    // Merge query parameters: preserve existing ones from path, add new ones.
    if (params) {
        for (const [key, value] of params.entries()) {
            url.searchParams.append(key, value);
        }
    }

    return url.toString();
}
