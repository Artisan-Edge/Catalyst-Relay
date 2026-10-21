/**
 * SAML browser transport: Chrome DevTools Protocol over a native WebSocket
 *
 * Used under the Bun runtime, where Playwright's launcher and WebSocket
 * transport hang. The Chromium binary is spawned with `--remote-debugging-port`
 * and driven directly over CDP. Playwright is still used (import only) to
 * resolve the browser executable path unless CATALYST_CHROMIUM_PATH is set.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { PlaywrightCookie, SamlBrowserLoginOptions } from './types';
import { DEFAULT_PROVIDER_CONFIG } from './types';
import { runLoginSequence, LOGIN_TIMEOUTS, type PageDriver } from './loginSequence';

/** Time allowed for the browser to start and expose its CDP endpoint (ms). */
const BROWSER_START_TIMEOUT = 60_000;
/** Quiet period with no in-flight requests that counts as idle (ms). */
const IDLE_QUIET = 600;

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

interface CdpEvent {
    method: string;
    params: Record<string, unknown>;
    sessionId?: string;
}

/** Minimal CDP client over a native WebSocket. */
interface CdpClient {
    send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<Record<string, unknown>>;
    on(handler: (msg: CdpEvent) => void): void;
    /** Resolves when the browser connection drops (window closed, process exited). */
    closed: Promise<void>;
    close(): void;
}

const BROWSER_CLOSED_MESSAGE = 'The browser was closed before sign-in completed.';

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
    const eventHandlers: Array<(msg: CdpEvent) => void> = [];

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

    // Once the socket drops, fail every in-flight and future call instead of
    // leaving promises pending forever (which would let the host process exit silently).
    let isClosed = false;
    const closed = new Promise<void>((resolve) => {
        const markClosed = (): void => {
            if (isClosed) return;
            isClosed = true;
            for (const { reject } of pending.values()) reject(new Error(BROWSER_CLOSED_MESSAGE));
            pending.clear();
            resolve();
        };
        ws.onclose = markClosed;
        ws.onerror = markClosed;
    });

    return {
        closed,
        send(method, params = {}, sessionId): Promise<Record<string, unknown>> {
            if (isClosed) return Promise.reject(new Error(BROWSER_CLOSED_MESSAGE));
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

/** Wait for the spawned browser to print its DevTools WebSocket URL. */
function awaitBrowserWsUrl(proc: ReturnType<typeof spawn>): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        let buffer = '';
        const timer = setTimeout(
            () => reject(new Error('Failed to launch browser: timed out waiting for the CDP endpoint.')),
            BROWSER_START_TIMEOUT
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
}

export async function performBrowserLoginViaCdp(
    options: SamlBrowserLoginOptions
): AsyncResult<PlaywrightCookie[], Error> {
    const { baseUrl, credentials, onStatus } = options;
    const config = options.providerConfig ?? DEFAULT_PROVIDER_CONFIG;
    const headless = options.headless ?? config.headless ?? true;

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
        client = await connectCdp(await awaitBrowserWsUrl(proc));

        // Open a page target and attach to it (flatten => sessionId-based routing).
        const { targetId } = (await client.send('Target.createTarget', { url: 'about:blank' })) as {
            targetId: string;
        };
        const { sessionId } = (await client.send('Target.attachToTarget', {
            targetId,
            flatten: true,
        })) as { sessionId: string };

        // Track in-flight requests (for idle detection) and top-frame navigations
        // (so the login sequence can tell a re-rendered form from an untouched one).
        let inflight = 0;
        let lastNetworkChange = Date.now();
        let topNavigations = 0;
        client.on((msg) => {
            if (msg.sessionId !== sessionId) return;
            if (msg.method === 'Network.requestWillBeSent') {
                inflight += 1;
                lastNetworkChange = Date.now();
            } else if (msg.method === 'Network.loadingFinished' || msg.method === 'Network.loadingFailed') {
                inflight = Math.max(0, inflight - 1);
                lastNetworkChange = Date.now();
            } else if (msg.method === 'Page.frameNavigated') {
                const frame = msg.params['frame'] as { parentId?: string } | undefined;
                if (!frame?.parentId) topNavigations += 1;
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

        const cdp = client;
        const driver: PageDriver = {
            evaluate: <T>(expression: string): Promise<T | null> => evaluateInPage<T>(cdp, sessionId, expression),
            waitForIdle: async (maxMs: number): Promise<void> => {
                const start = Date.now();
                while (Date.now() - start < maxMs) {
                    if (inflight === 0 && Date.now() - lastNetworkChange > IDLE_QUIET) return;
                    await sleep(LOGIN_TIMEOUTS.POLL);
                }
            },
            topNavigations: (): number => topNavigations,
        };

        // A closed browser window must end the login promptly rather than hang
        const browserClosed = cdp.closed.then(() => err(new Error(BROWSER_CLOSED_MESSAGE)));
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

/**
 * Evaluate an expression in the page and return its JSON value.
 *
 * Returns null on failure (e.g. the execution context was destroyed by a
 * navigation mid-evaluation) so callers can retry or fail gracefully.
 */
async function evaluateInPage<T>(client: CdpClient, sessionId: string, expression: string): Promise<T | null> {
    try {
        const res = (await client.send(
            'Runtime.evaluate',
            { expression, returnByValue: true },
            sessionId
        )) as { result?: { value?: T } };
        return res.result?.value ?? null;
    } catch {
        return null;
    }
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
