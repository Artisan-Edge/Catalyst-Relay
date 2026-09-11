/**
 * SAML browser transport: Playwright
 *
 * Used under Node/Electron (e.g. the VS Code extension), where Playwright's
 * launcher works normally. Playwright is dynamically imported so it is only
 * required when SAML is actually used.
 */

import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { PlaywrightCookie, SamlBrowserLoginOptions } from './types';
import { DEFAULT_PROVIDER_CONFIG } from './types';
import { runLoginSequence, type PageDriver } from './loginSequence';

/** Time allowed for the initial navigation to the SAP login URL (ms). */
const PAGE_LOAD_TIMEOUT = 60_000;

export async function performBrowserLoginViaPlaywright(
    options: SamlBrowserLoginOptions
): AsyncResult<PlaywrightCookie[], Error> {
    const { baseUrl, credentials, onStatus } = options;
    const config = options.providerConfig ?? DEFAULT_PROVIDER_CONFIG;
    const headless = options.headless ?? config.headless ?? true;

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

        // Count top-frame navigations so the login sequence can detect a re-rendered form
        let topNavigations = 0;
        page.on('framenavigated', (frame) => {
            if (frame === page.mainFrame()) topNavigations += 1;
        });

        // Navigate to SAP login page.
        const loginUrl = `${baseUrl}/sap/bc/adt/compatibility/graph`;
        try {
            await page.goto(loginUrl, {
                timeout: PAGE_LOAD_TIMEOUT,
                waitUntil: 'domcontentloaded',
            });
        } catch {
            return err(new Error('Failed to load login page. Please check if the server is online.'));
        }

        const driver: PageDriver = {
            evaluate: async <T>(expression: string): Promise<T | null> => {
                try {
                    return (await page.evaluate(expression)) as T;
                } catch {
                    return null;
                }
            },
            waitForIdle: async (maxMs: number): Promise<void> => {
                try {
                    await page.waitForLoadState('networkidle', { timeout: maxMs });
                } catch {
                    /* a page that never goes idle is tolerated; the sequence polls page state instead */
                }
            },
            topNavigations: (): number => topNavigations,
        };

        // A closed browser window must end the login promptly rather than hang
        const browserClosed = new Promise<Result<void, Error>>((resolve) => {
            page.once('close', () => resolve(err(new Error('The browser was closed before sign-in completed.'))));
        });
        const [, loginError] = await Promise.race([
            runLoginSequence(driver, {
                sapHost: new URL(baseUrl).host,
                credentials,
                formSelectors: config.formSelectors,
                interactive: !headless,
                ...(onStatus && { onStatus }),
            }),
            browserClosed,
        ]);
        if (loginError) return err(loginError);

        // Extract cookies.
        const cookies = await context.cookies();

        return ok(cookies as PlaywrightCookie[]);
    } finally {
        await browser.close();
    }
}
