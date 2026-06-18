/**
 * SAML browser automation
 *
 * Implements the headless browser login flow used for SAML SSO.
 *
 * Two transports are supported, selected by runtime:
 *  - Under the Bun runtime, the browser is driven via the Chrome DevTools
 *    Protocol (CDP) over Bun's native WebSocket. Playwright's own launcher and
 *    WebSocket transport do not work under Bun (the `--remote-debugging-pipe`
 *    handshake and Playwright's bundled WS client both hang), so we spawn the
 *    Chromium binary ourselves with `--remote-debugging-port` and talk CDP
 *    directly. Playwright is still used (import only) to resolve the browser
 *    executable path, so browser provisioning is unchanged.
 *  - Under Node/Electron (e.g. the VS Code extension), Playwright works
 *    normally, so the original Playwright flow is used.
 *
 * Playwright is dynamically imported to avoid requiring it when not using SAML.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { PlaywrightCookie, SamlProviderConfig } from './types';
import { DEFAULT_PROVIDER_CONFIG } from './types';

/** Timeouts for browser automation (ms) */
const TIMEOUTS = {
    PAGE_LOAD: 60_000,
    FORM_SELECTOR: 15_000,
    NETWORK_IDLE: 30_000,
    /** Quiet period with no in-flight requests that counts as "idle". */
    IDLE_QUIET: 600,
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

/** True when running under the Bun runtime. */
const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';

/**
 * Perform SAML login using headless browser automation.
 *
 * Navigates to the SAP login page, fills in credentials, and extracts session
 * cookies. Uses native-WebSocket CDP under Bun and Playwright elsewhere.
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
    return isBun
        ? performBrowserLoginViaCdp(options)
        : performBrowserLoginViaPlaywright(options);
}

/* -------------------------------------------------------------------------- */
/* Playwright transport (Node / Electron)                                     */
/* -------------------------------------------------------------------------- */

async function performBrowserLoginViaPlaywright(
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

/* -------------------------------------------------------------------------- */
/* Native-WebSocket CDP transport (Bun)                                       */
/* -------------------------------------------------------------------------- */

/** Raw CDP cookie shape (subset of Network.Cookie). */
interface CdpCookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
}

/** Minimal CDP client over a native WebSocket. */
interface CdpClient {
    send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<Record<string, unknown>>;
    on(handler: (msg: { method: string; params: Record<string, unknown>; sessionId?: string }) => void): void;
    close(): void;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Resolve the Chromium executable path via Playwright (no launch).
 * Playwright remains the browser provider; only the transport changes.
 */
async function resolveChromiumPath(): Promise<[string, null] | [null, Error]> {
    // Allow pointing at a specific Chrome/Chromium binary, bypassing Playwright.
    const override = process.env['CATALYST_CHROMIUM_PATH'];
    if (override) return [override, null];

    try {
        const playwright = await import('playwright');
        const path = playwright.chromium.executablePath();
        if (!path) {
            return [null, new Error('Could not resolve the Chromium executable path from Playwright.')];
        }
        return [path, null];
    } catch {
        return [
            null,
            new Error(
                'Playwright is required for SAML authentication but is not installed. ' +
                'Install it with: npm install playwright'
            ),
        ];
    }
}

/** Connect a minimal CDP client to a browser WebSocket endpoint. */
async function connectCdp(wsUrl: string): Promise<CdpClient> {
    const WebSocketCtor = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    if (!WebSocketCtor) {
        throw new Error('Native WebSocket is not available in this runtime.');
    }

    const ws = new WebSocketCtor(wsUrl);
    let nextId = 0;
    const pending = new Map<number, { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }>();
    const eventHandlers: Array<(msg: { method: string; params: Record<string, unknown>; sessionId?: string }) => void> = [];

    ws.onmessage = (event: MessageEvent): void => {
        const msg = JSON.parse(String(event.data)) as {
            id?: number;
            result?: Record<string, unknown>;
            error?: { message: string };
            method?: string;
            params?: Record<string, unknown>;
            sessionId?: string;
        };
        if (typeof msg.id === 'number' && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id)!;
            pending.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg.result ?? {});
        } else if (msg.method) {
            for (const handler of eventHandlers) {
                handler({
                    method: msg.method,
                    params: msg.params ?? {},
                    ...(msg.sessionId !== undefined ? { sessionId: msg.sessionId } : {}),
                });
            }
        }
    };

    await new Promise<void>((resolve, reject) => {
        ws.onopen = (): void => resolve();
        ws.onerror = (): void => reject(new Error('Failed to connect to the browser CDP endpoint.'));
    });

    return {
        send(method, params = {}, sessionId): Promise<Record<string, unknown>> {
            return new Promise((resolve, reject) => {
                const id = ++nextId;
                pending.set(id, { resolve, reject });
                ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
            });
        },
        on(handler): void {
            eventHandlers.push(handler);
        },
        close(): void {
            ws.close();
        },
    };
}

async function performBrowserLoginViaCdp(
    options: SamlBrowserLoginOptions
): AsyncResult<PlaywrightCookie[], Error> {
    const { baseUrl, credentials, headless = true } = options;
    const config = options.providerConfig ?? DEFAULT_PROVIDER_CONFIG;

    const [exePath, pathError] = await resolveChromiumPath();
    if (pathError) return err(pathError);

    const userDataDir = mkdtempSync(join(tmpdir(), 'catalyst-saml-'));
    const args = [
        ...(headless ? ['--headless=new'] : []),
        '--remote-debugging-port=0',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${userDataDir}`,
        ...(config.ignoreHttpsErrors ? ['--ignore-certificate-errors'] : []),
    ];

    const proc = spawn(exePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let client: CdpClient | null = null;

    const cleanup = (): void => {
        try {
            client?.close();
        } catch {
            /* ignore */
        }
        try {
            proc.kill();
        } catch {
            /* ignore */
        }
        try {
            rmSync(userDataDir, { recursive: true, force: true });
        } catch {
            /* ignore */
        }
    };

    try {
        // The browser prints "DevTools listening on ws://..." to stderr once ready.
        const browserWsUrl = await new Promise<string>((resolve, reject) => {
            let buffer = '';
            const timer = setTimeout(
                () => reject(new Error('Failed to launch browser: timed out waiting for the CDP endpoint.')),
                TIMEOUTS.PAGE_LOAD
            );
            proc.stderr?.on('data', (chunk) => {
                buffer += String(chunk);
                const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
                if (match) {
                    clearTimeout(timer);
                    resolve(match[1]!);
                }
            });
            proc.on('error', (e) => {
                clearTimeout(timer);
                reject(new Error(`Failed to launch browser: ${e instanceof Error ? e.message : String(e)}`));
            });
            proc.on('exit', (code) => {
                clearTimeout(timer);
                reject(new Error(`Failed to launch browser: process exited early (code ${code}).`));
            });
        });

        client = await connectCdp(browserWsUrl);

        // Open a page target and attach to it (flatten => sessionId-based routing).
        const { targetId } = (await client.send('Target.createTarget', { url: 'about:blank' })) as {
            targetId: string;
        };
        const { sessionId } = (await client.send('Target.attachToTarget', {
            targetId,
            flatten: true,
        })) as { sessionId: string };

        // Track in-flight requests so we can detect a "network idle" state.
        let inflight = 0;
        let lastNetworkChange = Date.now();
        client.on((msg) => {
            if (msg.sessionId !== sessionId) return;
            if (msg.method === 'Network.requestWillBeSent') {
                inflight += 1;
                lastNetworkChange = Date.now();
            } else if (msg.method === 'Network.loadingFinished' || msg.method === 'Network.loadingFailed') {
                inflight = Math.max(0, inflight - 1);
                lastNetworkChange = Date.now();
            }
        });

        await client.send('Page.enable', {}, sessionId);
        await client.send('Network.enable', {}, sessionId);
        await client.send('Runtime.enable', {}, sessionId);

        // Navigate to the SAP login page.
        const loginUrl = `${baseUrl}/sap/bc/adt/compatibility/graph`;
        const navResult = (await client.send('Page.navigate', { url: loginUrl }, sessionId)) as {
            errorText?: string;
        };
        if (navResult.errorText) {
            return err(new Error('Failed to load login page. Please check if the server is online.'));
        }

        // Wait for the login form to appear.
        const usernameSel = config.formSelectors.username;
        const formFound = await waitForSelector(client, sessionId, usernameSel, TIMEOUTS.FORM_SELECTOR);
        if (!formFound) {
            return err(new Error('Login form not found. The page may have changed or loaded incorrectly.'));
        }

        // Fill credentials and submit, dispatching input/change events so any
        // client-side validation on the login form is triggered.
        const fillExpr = `(() => {
            const u = document.querySelector(${JSON.stringify(config.formSelectors.username)});
            const p = document.querySelector(${JSON.stringify(config.formSelectors.password)});
            const s = document.querySelector(${JSON.stringify(config.formSelectors.submit)});
            if (!u || !p || !s) return false;
            const set = (el, val) => {
                el.value = val;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            };
            set(u, ${JSON.stringify(credentials.username)});
            set(p, ${JSON.stringify(credentials.password)});
            s.click();
            return true;
        })()`;
        const fillResult = (await client.send(
            'Runtime.evaluate',
            { expression: fillExpr, returnByValue: true },
            sessionId
        )) as { result?: { value?: boolean } };
        if (fillResult.result?.value !== true) {
            return err(new Error('Login form not found. The page may have changed or loaded incorrectly.'));
        }

        // Wait for login to settle (network idle), best-effort up to the cap.
        const idleStart = Date.now();
        while (Date.now() - idleStart < TIMEOUTS.NETWORK_IDLE) {
            if (inflight === 0 && Date.now() - lastNetworkChange > TIMEOUTS.IDLE_QUIET) break;
            await sleep(100);
        }

        // Extract cookies.
        const { cookies } = (await client.send('Network.getAllCookies', {}, sessionId)) as {
            cookies: CdpCookie[];
        };

        return ok(cookies.map(toPlaywrightCookie));
    } catch (e) {
        return err(
            new Error(`SAML browser login failed: ${e instanceof Error ? e.message : String(e)}`)
        );
    } finally {
        cleanup();
    }
}

/** Poll the page for a selector until it exists or the timeout elapses. */
async function waitForSelector(
    client: CdpClient,
    sessionId: string,
    selector: string,
    timeoutMs: number
): Promise<boolean> {
    const start = Date.now();
    const expression = `!!document.querySelector(${JSON.stringify(selector)})`;
    while (Date.now() - start < timeoutMs) {
        const res = (await client.send(
            'Runtime.evaluate',
            { expression, returnByValue: true },
            sessionId
        )) as { result?: { value?: boolean } };
        if (res.result?.value === true) return true;
        await sleep(200);
    }
    return false;
}

/** Map a raw CDP cookie to the PlaywrightCookie shape used downstream. */
function toPlaywrightCookie(c: CdpCookie): PlaywrightCookie {
    const sameSite =
        c.sameSite === 'Strict' || c.sameSite === 'Lax' || c.sameSite === 'None' ? c.sameSite : 'Lax';
    return {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: typeof c.expires === 'number' ? c.expires : -1,
        httpOnly: Boolean(c.httpOnly),
        secure: Boolean(c.secure),
        sameSite,
    };
}
