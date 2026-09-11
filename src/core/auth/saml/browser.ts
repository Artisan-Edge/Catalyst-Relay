/**
 * SAML browser automation
 *
 * Entry point for the headless browser login flow used for SAML SSO.
 *
 * Two transports are supported, selected by runtime:
 *  - Under the Bun runtime, the browser is driven via the Chrome DevTools
 *    Protocol (CDP) over Bun's native WebSocket (see cdpTransport.ts).
 *    Playwright's own launcher and WebSocket transport do not work under Bun.
 *  - Under Node/Electron (e.g. the VS Code extension), Playwright works
 *    normally (see playwrightTransport.ts).
 *
 * Both transports run the same sign-on sequence (see loginSequence.ts), which
 * fills the identity provider's form, waits for the browser to return to the
 * SAP host - long enough for a multi-factor approval - and reports progress
 * through the optional onStatus callback.
 */

import type { AsyncResult } from '../../../types/result';
import type { PlaywrightCookie, SamlBrowserLoginOptions } from './types';
import { performBrowserLoginViaCdp } from './cdpTransport';
import { performBrowserLoginViaPlaywright } from './playwrightTransport';

export type { SamlCredentials, SamlBrowserLoginOptions } from './types';

/** True when running under the Bun runtime. */
const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';

/**
 * Perform SAML login using headless browser automation.
 *
 * Navigates to the SAP login page, fills in credentials, waits for the
 * identity provider to post back to SAP, and extracts session cookies.
 *
 * @param options - Login options including URL, credentials and status callback
 * @returns Session cookies on success, error on failure
 *
 * @example
 * ```typescript
 * const [cookies, error] = await performBrowserLogin({
 *     baseUrl: 'https://sap-system.example.com',
 *     credentials: { username: 'user@example.com', password: 'secret' },
 *     onStatus: (message) => console.error(message),
 * });
 * if (error) {
 *     console.error('Login failed:', error.message);
 *     return;
 * }
 * // Use cookies for authenticated requests
 * ```
 */
export async function performBrowserLogin(
    options: SamlBrowserLoginOptions
): AsyncResult<PlaywrightCookie[], Error> {
    return isBun
        ? performBrowserLoginViaCdp(options)
        : performBrowserLoginViaPlaywright(options);
}
