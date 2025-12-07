/**
 * SAML browser automation
 *
 * Implements headless browser login flow using Playwright.
 * Dynamically imports Playwright to avoid requiring it when not using SAML.
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { PlaywrightCookie, SamlProviderConfig } from './types';
import { DEFAULT_PROVIDER_CONFIG } from './types';

/** Timeouts for browser automation */
const TIMEOUTS = {
    PAGE_LOAD: 60_000,
    FORM_SELECTOR: 10_000,
} as const;

/**
 * Credentials for SAML login
 */
export interface SamlCredentials {
    username: string;
    password: string;
}

/**
 * Options for SAML browser login
 */
export interface SamlBrowserLoginOptions {
    /** SAP system base URL */
    baseUrl: string;
    /** Login credentials */
    credentials: SamlCredentials;
    /** Optional custom provider config (overrides auto-detection) */
    providerConfig?: SamlProviderConfig;
    /** Whether to run browser in headless mode (default: true) */
    headless?: boolean;
}

/**
 * Perform SAML login using headless browser automation
 *
 * Launches a Chromium browser, navigates to the SAP login page,
 * fills in credentials, and extracts session cookies.
 *
 * @param options - Login options including URL and credentials
 * @returns Session cookies on success, error on failure
 *
 * @example
 * ```typescript
 * const [cookies, error] = await performBrowserLogin({
 *     baseUrl: 'https://sap-system.example.com',
 *     credentials: { username: 'user@example.com', password: 'secret' }
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
    const { baseUrl, credentials, headless = true } = options;
    const config = options.providerConfig ?? DEFAULT_PROVIDER_CONFIG;

    // Dynamically import Playwright to avoid requiring it when not using SAML.
    let playwright;
    try {
        playwright = await import('playwright');
    } catch {
        return err(
            new Error(
                'Playwright is required for SAML authentication but is not installed. ' +
                'Install it with: npm install playwright'
            )
        );
    }

    const browserArgs = config.ignoreHttpsErrors
        ? ['--ignore-certificate-errors', '--disable-web-security']
        : [];

    let browser;
    try {
        browser = await playwright.chromium.launch({
            headless,
            args: browserArgs,
        });
    } catch (launchError) {
        return err(
            new Error(
                `Failed to launch browser: ${launchError instanceof Error ? launchError.message : String(launchError)}`
            )
        );
    }

    try {
        const context = await browser.newContext({
            ignoreHTTPSErrors: config.ignoreHttpsErrors,
        });
        const page = await context.newPage();

        // Navigate to SAP login page.
        const loginUrl = `${baseUrl}/sap/bc/adt/compatibility/graph`;
        try {
            await page.goto(loginUrl, {
                timeout: TIMEOUTS.PAGE_LOAD,
                waitUntil: 'domcontentloaded',
            });
        } catch {
            return err(new Error('Failed to load login page. Please check if the server is online.'));
        }

        // Wait for and fill login form.
        try {
            await page.waitForSelector(config.formSelectors.username, {
                timeout: TIMEOUTS.FORM_SELECTOR,
            });
        } catch {
            return err(new Error('Login form not found. The page may have changed or loaded incorrectly.'));
        }

        await page.fill(config.formSelectors.username, credentials.username);
        await page.fill(config.formSelectors.password, credentials.password);
        await page.click(config.formSelectors.submit);

        // Wait for login to complete.
        await page.waitForLoadState('networkidle');

        // Extract cookies.
        const cookies = await context.cookies();

        return ok(cookies as PlaywrightCookie[]);
    } finally {
        await browser.close();
    }
}
