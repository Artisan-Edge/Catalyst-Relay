/**
 * Cookie extraction and formatting for SAML authentication
 *
 * Converts Playwright cookies to AuthCookie format used by the rest of the codebase.
 */

import type { AuthCookie } from '../types';
import type { PlaywrightCookie } from './types';

/**
 * Convert Playwright cookies to AuthCookie format
 *
 * @param playwrightCookies - Cookies from Playwright browser context
 * @returns Array of AuthCookie objects
 */
export function toAuthCookies(playwrightCookies: PlaywrightCookie[]): AuthCookie[] {
    return playwrightCookies.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
    }));
}

/**
 * Format cookies as Cookie header value
 *
 * @param cookies - Array of AuthCookie objects
 * @returns Cookie header string (e.g., "name1=value1; name2=value2")
 */
export function formatCookieHeader(cookies: AuthCookie[]): string {
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}
