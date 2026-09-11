/**
 * SAML sign-on sequence
 *
 * Drives the identity provider's sign-on form through a PageDriver, which
 * abstracts the browser transport (CDP under Bun, Playwright elsewhere), so the
 * flow itself exists once. After the password is submitted the browser is given
 * time to come back to the SAP host, which lets a multi-factor approval (e.g. a
 * PingID or Authenticator push) complete before cookies are collected.
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { SamlLoginStatusCallback } from '../../../types/config';
import type { FormSelectors } from './types';

/** Timeouts for the sign-on sequence (ms) */
export const LOGIN_TIMEOUTS = {
    /** Wait for the sign-on form after navigating to SAP. */
    FORM_SELECTOR: 15_000,
    /** Wait for the password step on two-step IdP pages (e.g. SAP IAS conditional authentication). */
    PASSWORD_STEP: 15_000,
    /** Let IdP page scripts settle before submitting; device-profiling adapters silently re-render the form otherwise. */
    PRE_SUBMIT_IDLE: 5_000,
    /** Wait for the IdP to post back to SAP - long enough to approve a multi-factor prompt on a phone. */
    LOGIN_COMPLETE: 120_000,
    /** Without a return to SAP after this long, tell the caller a multi-factor prompt is probably pending. */
    MFA_HINT: 5_000,
    /** Let the SAP landing page finish loading so every session cookie is set. */
    POST_LOGIN_IDLE: 10_000,
    /** With a visible browser, how long the user gets to finish the sign-in by hand. */
    MANUAL_COMPLETE: 300_000,
    /** Poll interval for page state checks. */
    POLL: 250,
} as const;

export type LoginTimeouts = { -readonly [K in keyof typeof LOGIN_TIMEOUTS]: number };

export const MFA_HINT_MESSAGE =
    'Waiting for the identity provider to finish signing in. ' +
    'If a multi-factor prompt was sent to your device, approve it now.';

export function manualSignInMessage(reason: string): string {
    return (
        `Automatic sign-in did not complete (${reason}). ` +
        'Finish signing in using the browser window that was opened; the login continues as soon as the browser returns to SAP.'
    );
}

// Elements identity providers use to show sign-on errors (PingFederate, SAP IAS, generic)
const MESSAGE_SELECTORS = '[role="alert"], .ping-messages, .ping-error, .error, .errorMessage, #globalMessages, .sapMMessageStrip';

/** Minimal page automation surface each browser transport implements. */
export interface PageDriver {
    /** Evaluate a JS expression in the page; null when it cannot be evaluated (e.g. mid-navigation). */
    evaluate<T>(expression: string): Promise<T | null>;
    /** Wait until the page has no requests in flight, giving up after maxMs. */
    waitForIdle(maxMs: number): Promise<void>;
    /** Number of top-frame navigations seen so far. */
    topNavigations(): number;
}

export interface LoginSequenceOptions {
    /** Host (including port) of the SAP system; arriving here means sign-on completed. */
    sapHost: string;
    credentials: { username: string; password: string };
    formSelectors: FormSelectors;
    /** Receives progress messages, e.g. when a multi-factor approval is pending. */
    onStatus?: SamlLoginStatusCallback;
    /** The browser is visible: when automation fails, leave the window to the user and wait for SAP. */
    interactive?: boolean;
    /** Override timeouts (used by tests). */
    timeouts?: Partial<LoginTimeouts>;
}

interface PageState {
    host: string;
    hasPassword: boolean;
    message: string;
    /** Condensed visible page text, relayed while a multi-factor step is pending (e.g. a number to match). */
    text: string;
}

/** Minimum gap between relayed page-text updates while a multi-factor step is pending (ms). */
const PAGE_TEXT_INTERVAL = 3_000;

type LoginOutcome =
    | { kind: 'sap' }
    | { kind: 'rejected'; page: string; message: string }
    | { kind: 'timeout'; page: string }
    | { kind: 'error'; error: Error };

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run the sign-on form flow on an already-navigated page.
 *
 * Expects the driver's page to be at the SAP login URL (or already redirected
 * to the IdP). Resolves once the browser is back on the SAP host with the
 * landing page settled, so the caller can collect cookies. In interactive mode
 * a failed automated attempt hands the visible window over to the user.
 */
export async function runLoginSequence(driver: PageDriver, options: LoginSequenceOptions): AsyncResult<void, Error> {
    const timeouts: LoginTimeouts = { ...LOGIN_TIMEOUTS, ...options.timeouts };

    const [, automatedError] = await runAutomatedSignIn(driver, options, timeouts);
    if (!automatedError) return ok(undefined);
    if (!options.interactive) return err(automatedError);

    // Visible browser: the user finishes the sign-in (MFA, retyped password, ...) by hand
    options.onStatus?.(manualSignInMessage(automatedError.message));
    const landed = await waitForHost(driver, options.sapHost, timeouts.MANUAL_COMPLETE, timeouts.POLL);
    if (!landed) return err(manualSignInTimeoutError(options.sapHost, timeouts.MANUAL_COMPLETE, await describePage(driver), automatedError));

    await driver.waitForIdle(timeouts.POST_LOGIN_IDLE);
    return ok(undefined);
}

async function runAutomatedSignIn(driver: PageDriver, options: LoginSequenceOptions, timeouts: LoginTimeouts): AsyncResult<void, Error> {
    const { username: usernameSel, password: passwordSel, submit: submitSel } = options.formSelectors;

    // Wait for and fill the sign-on form
    const formFound = await waitForSelector(driver, usernameSel, timeouts.FORM_SELECTOR, timeouts.POLL);
    if (!formFound) return err(loginFormError(usernameSel, await describePage(driver)));

    const usernameFilled = await driver.evaluate<boolean>(fillFieldExpr(usernameSel, options.credentials.username));
    if (usernameFilled !== true) return err(loginFormError(usernameSel, await describePage(driver)));

    // Two-step IdP pages (e.g. SAP IAS conditional authentication) only show
    // the password field after the username is submitted
    const passwordPresent = await driver.evaluate<boolean>(existsExpr(passwordSel));
    if (passwordPresent !== true) {
        await driver.evaluate<boolean>(clickExpr(submitSel));
        const passwordFound = await waitForSelector(driver, passwordSel, timeouts.PASSWORD_STEP, timeouts.POLL);
        if (!passwordFound) return err(passwordStepError(passwordSel, await describePage(driver)));
    }

    // Submit, retrying once when the IdP re-renders the form without any error:
    // device-profiling adapters do that when their scripts had not finished
    let outcome = await fillAndSubmit(driver, options, timeouts);
    if (outcome.kind === 'rejected' && !outcome.message) {
        outcome = await fillAndSubmit(driver, options, timeouts);
    }

    switch (outcome.kind) {
        case 'sap':
            await driver.waitForIdle(timeouts.POST_LOGIN_IDLE);
            return ok(undefined);
        case 'rejected':
            return err(credentialsRejectedError(outcome.page, outcome.message));
        case 'timeout':
            return err(loginTimeoutError(options.sapHost, timeouts.LOGIN_COMPLETE, outcome.page));
        case 'error':
            return err(outcome.error);
        default: {
            const _exhaustive: never = outcome;
            return err(new Error(`Unhandled login outcome: ${String(_exhaustive)}`));
        }
    }
}

async function fillAndSubmit(driver: PageDriver, options: LoginSequenceOptions, timeouts: LoginTimeouts): Promise<LoginOutcome> {
    const { username: usernameSel, password: passwordSel, submit: submitSel } = options.formSelectors;

    // The username may be gone (two-step page) or re-rendered empty (retry); fill when present
    await driver.evaluate<boolean>(fillFieldExpr(usernameSel, options.credentials.username));
    const passwordFilled = await driver.evaluate<boolean>(fillFieldExpr(passwordSel, options.credentials.password));
    if (passwordFilled !== true) return { kind: 'error', error: loginFormError(passwordSel, await describePage(driver)) };

    // Let IdP scripts (e.g. device profiling) finish before submitting
    await driver.waitForIdle(timeouts.PRE_SUBMIT_IDLE);

    const navigationsBeforeSubmit = driver.topNavigations();
    const submitted = await driver.evaluate<boolean>(clickExpr(submitSel));
    if (submitted !== true) return { kind: 'error', error: loginFormError(submitSel, await describePage(driver)) };

    return awaitLoginOutcome(driver, options, timeouts, navigationsBeforeSubmit);
}

// Poll until the browser is back on SAP, the IdP re-rendered the sign-on form,
// or the overall login timeout elapses
async function awaitLoginOutcome(driver: PageDriver, options: LoginSequenceOptions, timeouts: LoginTimeouts, navigationsBeforeSubmit: number): Promise<LoginOutcome> {
    const start = Date.now();
    let hinted = false;
    let lastText = '';
    let lastTextAt = 0;

    while (Date.now() - start < timeouts.LOGIN_COMPLETE) {
        const state = await driver.evaluate<PageState>(pageStateExpr(options.formSelectors.password));

        if (state?.host === options.sapHost) return { kind: 'sap' };

        // The IdP answered the submit by rendering the sign-on form again
        if (state?.hasPassword && driver.topNavigations() > navigationsBeforeSubmit) {
            return { kind: 'rejected', page: await describePage(driver), message: state.message };
        }

        if (!hinted && state !== null && !state.hasPassword && Date.now() - start > timeouts.MFA_HINT) {
            hinted = true;
            options.onStatus?.(MFA_HINT_MESSAGE);
        }

        // Relay what the IdP page shows (e.g. "select 42 on your device") since the user cannot see it
        const text = state?.text ?? '';
        if (hinted && text && text !== lastText && Date.now() - lastTextAt > PAGE_TEXT_INTERVAL) {
            lastText = text;
            lastTextAt = Date.now();
            options.onStatus?.(`Identity provider page: ${text}`);
        }

        await sleep(timeouts.POLL);
    }

    return { kind: 'timeout', page: await describePage(driver) };
}

async function waitForHost(driver: PageDriver, host: string, timeoutMs: number, pollMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const current = await driver.evaluate<string>('location.host');
        if (current === host) return true;
        await sleep(pollMs);
    }
    return false;
}

async function waitForSelector(driver: PageDriver, selector: string, timeoutMs: number, pollMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const found = await driver.evaluate<boolean>(existsExpr(selector));
        if (found === true) return true;
        await sleep(pollMs);
    }
    return false;
}

async function describePage(driver: PageDriver): Promise<string> {
    const desc = await driver.evaluate<string>(`location.href + ' ("' + document.title + '")'`);
    return desc ?? 'an unknown page';
}

/* -------------------------------------------------------------------------- */
/* Page expressions                                                           */
/* -------------------------------------------------------------------------- */

/** Expression: whether a selector exists in the page. */
export function existsExpr(selector: string): string {
    return `!!document.querySelector(${JSON.stringify(selector)})`;
}

/** Expression: fill a form field and dispatch input/change events. Returns true when the field exists. */
export function fillFieldExpr(selector: string, value: string): string {
    return `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.value = ${JSON.stringify(value)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    })()`;
}

/** Expression: click an element. Returns true when the element exists. */
export function clickExpr(selector: string): string {
    return `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.click();
        return true;
    })()`;
}

/** Expression: current host, whether the password field is present, and any visible IdP message. */
export function pageStateExpr(passwordSelector: string): string {
    return `(() => {
        const texts = [];
        document.querySelectorAll(${JSON.stringify(MESSAGE_SELECTORS)}).forEach((el) => {
            const text = (el.innerText || '').replace(/\\s+/g, ' ').trim();
            if (text) texts.push(text);
        });
        return {
            host: location.host,
            hasPassword: !!document.querySelector(${JSON.stringify(passwordSelector)}),
            message: texts.join(' | ').slice(0, 300),
            text: document.body ? (document.body.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 400) : '',
        };
    })()`;
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export function loginFormError(selector: string, pageDesc: string): Error {
    return new Error(
        `Login form not found: "${selector}" is missing on ${pageDesc}. ` +
        'The login page may have changed; configure custom form selectors for this system if so.'
    );
}

export function passwordStepError(selector: string, pageDesc: string): Error {
    return new Error(
        `Password field "${selector}" did not appear after submitting the username; landed on ${pageDesc}. ` +
        'The identity provider may require a different login method (e.g. two-factor or passwordless).'
    );
}

export function credentialsRejectedError(pageDesc: string, message: string): Error {
    const detail = message ? ` with the message "${message}"` : '';
    return new Error(
        `The identity provider did not accept the login and re-displayed the sign-on form${detail} (${pageDesc}). ` +
        'Check the username and password.'
    );
}

export function loginTimeoutError(sapHost: string, timeoutMs: number, pageDesc: string): Error {
    return new Error(
        `Sign-in did not return to ${sapHost} within ${Math.round(timeoutMs / 1000)}s; the browser is at ${pageDesc}. ` +
        'If the identity provider requires multi-factor approval, approve the prompt on your device promptly and retry.'
    );
}

export function manualSignInTimeoutError(sapHost: string, timeoutMs: number, pageDesc: string, automatedError: Error): Error {
    return new Error(
        `Sign-in was not completed in the browser window within ${Math.round(timeoutMs / 1000)}s ` +
        `(the browser is at ${pageDesc}, not ${sapHost}). Automatic sign-in had failed first: ${automatedError.message}`
    );
}
