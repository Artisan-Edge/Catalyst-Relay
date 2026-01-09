/**
 * HTTP Header Utilities for ADT Requests
 *
 * Provides header building utilities and constants for SAP ADT HTTP requests.
 * Centralizes header management to avoid duplication across client code.
 */

import { CSRF_TOKEN_HEADER, FETCH_CSRF_TOKEN } from './csrf';
import type { AuthConfig } from '../../types/config';

// Mimic Eclipse ADT plugin for compatibility
export const BASE_HEADERS = {
    'Accept': '*/*',
    'X-sap-adt-sessiontype': 'stateful',
    'User-Agent': 'Eclipse/4.34.0 ADT/3.46.0',
    'X-sap-adt-profiling': 'server-time',
} as const;

// Default request timeout in milliseconds
export const DEFAULT_TIMEOUT = 30000;

/**
 * Build request headers with auth and CSRF token
 *
 * @param baseHeaders - Base headers to include in all requests
 * @param customHeaders - Request-specific headers
 * @param auth - Authentication config (for basic auth header)
 * @param csrfToken - Current CSRF token (if available)
 * @returns Combined headers object
 */
export function buildRequestHeaders(
    baseHeaders: Record<string, string>,
    customHeaders?: Record<string, string>,
    auth?: AuthConfig,
    csrfToken?: string | null
): Record<string, string> {
    // Merge base and custom headers.
    const headers: Record<string, string> = {
        ...baseHeaders,
        ...(customHeaders ?? {}),
    };

    // Add basic auth header if using basic authentication.
    if (auth?.type === 'basic') {
        // Use btoa for base64 encoding (web standard, available in both Node 18+ and Bun)
        const credentials = btoa(`${auth.username}:${auth.password}`);
        headers['Authorization'] = `Basic ${credentials}`;
    }

    // Add CSRF token if we have one (but not the 'fetch' placeholder).
    // Don't overwrite if custom headers already set the CSRF token (e.g., for token refresh).
    if (csrfToken && csrfToken !== FETCH_CSRF_TOKEN && !customHeaders?.[CSRF_TOKEN_HEADER]) {
        headers[CSRF_TOKEN_HEADER] = csrfToken;
    }

    return headers;
}

/**
 * Extract CSRF token from response headers
 *
 * SAP returns token in both upper and lowercase variations,
 * so we need to check both.
 *
 * @param headers - Response headers from SAP ADT server
 * @returns Extracted CSRF token or null if not found
 */
export function extractCsrfToken(headers: Headers): string | null {
    // Try both upper and lowercase header names.
    const token = headers.get(CSRF_TOKEN_HEADER) ||
                  headers.get(CSRF_TOKEN_HEADER.toLowerCase());

    // Ignore the fetch token itself.
    if (!token || token === FETCH_CSRF_TOKEN) {
        return null;
    }

    return token;
}
