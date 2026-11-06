/**
 * IAM Publish — "Publish Locally" for IAM apps, business catalogs and role templates, waiting for completion
 *
 * The publish POST is synchronous: SAP answers after about two minutes with the final
 * publishingStatusText. publishStatus on the object is no signal (a never-published app reads 'p').
 * It takes no lock, so it runs stateless: the stateful session stays free. Overlapping stateless
 * publishes of one object both end 'p', so re-posting after a client timeout is safe.
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { IamObjectKind, IamPublishOptions } from './types';
import { safeParseXml } from '../../utils/xml';
import { checkResponse } from '../helpers';
import { REQUEST_TIMEOUT_MESSAGE } from '../../utils/headers';
import { KIND_LABELS } from './helpers';

const UNPUBLISHED_STATUS = 'u';
// 'u' ends a run unpublished: re-post once, then report the publish as pending
const MAX_UNPUBLISHED_RUNS = 2;
const DEFAULT_REQUEST_TIMEOUT_MS = 300_000;
const DEFAULT_RETRY_DELAY_MS = 30_000;
const DEFAULT_DEADLINE_MS = 600_000;
// A publish takes about two minutes; a POST started with less time left would only time out
const DEFAULT_MIN_POST_WINDOW_MS = 150_000;
// Gap between attempts, so instant failures cannot loop
const DEFAULT_MIN_ATTEMPT_DELAY_MS = 3_000;
const MS_PER_SECOND = 1000;
const ELEMENT_NODE = 1;
const IAM_NS_PREFIX = 'http://www.sap.com/iam/';
const STATUS_ROOT = 'publishingStatus';
const STATUS_TEXT = 'publishingStatusText';
// Children that mean SAP reported a problem inside the status document
const PROBLEM_CHILDREN = new Set(['message', 'messages', 'error', 'errors', 'exception']);
// Gateway errors, an unavailable server and dropped connections: the publish may still be running, so re-post.
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const TRANSIENT_ERROR = /socket hang up|ECONNRESET|EPIPE|ETIMEDOUT|ECONNABORTED/i;
// Checked on the error and its cause: Bun's node:http words these differently from Node
const TRANSIENT_CODES = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNABORTED']);

/** Message parts of IamPublishError (internal; callers map on failure/pending) */
export const IAM_PUBLISH_MESSAGES = {
    /** Definitive: SAP ended the publish with a status other than done or 'u' */
    endedWithStatus: 'ended with status',
    /** Not definitive: the object may still publish; record it and retry on the next run */
    pending: 'is pending',
    /** Definitive: a 200 that is not a clean publishingStatus document (e.g. a logon page) */
    unexpectedResponse: 'unexpected response',
} as const;

/**
 * Why a publish failed:
 * - pending: not finished — 'u' twice, or no time left for another POST (timedOut); it may still publish
 * - status: SAP ended it with another status (definitive)
 * - response: a 200 that is not a clean publishingStatus document (definitive)
 * - request: an HTTP or connection error
 */
export type IamPublishFailure = 'pending' | 'status' | 'response' | 'request';

/** A failed or pending publish (Error.name is 'IamPublishError'; the object is kind + objectName) */
export class IamPublishError extends Error {
    readonly kind: IamObjectKind;
    readonly objectName: string;
    readonly failure: IamPublishFailure;
    /** Last publishingStatusText read (null when none was) */
    readonly lastStatus: string | null;
    /** The deadline left no time for another POST */
    readonly timedOut: boolean;
    /** The object may still publish (not a definitive failure): record it and retry later */
    readonly pending: boolean;

    constructor(message: string, kind: IamObjectKind, objectName: string, failure: IamPublishFailure, lastStatus: string | null, timedOut = false) {
        super(message);
        this.name = 'IamPublishError';
        this.kind = kind;
        this.objectName = objectName;
        this.failure = failure;
        this.lastStatus = lastStatus;
        this.timedOut = timedOut;
        this.pending = failure === 'pending';
    }
}

export interface IamPublishRequest {
    kind: IamObjectKind;
    /** Object name (upper case) */
    name: string;
    path: string;
    /** Query parameters naming the object */
    params: Record<string, string>;
    accept: string;
    /** Content-Type of the bodiless POST, where SAP's own client sends one */
    contentType?: string;
    /** publishingStatusText values that mean the publish finished */
    doneStatuses: readonly string[];
}

/**
 * POST a publish (stateless) and wait for it to finish.
 *
 * - A client timeout re-posts at once; a 502/504 or dropped connection waits retryDelayMs first.
 * - 'u' (the run ended unpublished) re-posts once after retryDelayMs, then fails as pending.
 * - No POST starts with less than minPostWindowMs left before the deadline: that fails as pending (timedOut).
 * - Attempts are at least minAttemptDelayMs apart; each request's timeout is capped at the time left.
 * - A done status ends the wait; another status, a non-publishingStatus 200 or an HTTP error fails definitively.
 *
 * @param client - ADT client
 * @param request - Publish endpoint and the statuses that mean done
 * @param options - Timing (defaults: 300 s per request, 30 s retry delay, 10 min overall, 150 s window, 3 s gap)
 * @returns The final publishingStatusText or IamPublishError
 */
export async function publishAndWait(
    client: AdtRequestor,
    request: IamPublishRequest,
    options: IamPublishOptions = {}
): AsyncResult<string, IamPublishError> {
    const requestTimeout = timing(options.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS, true);
    const retryDelay = timing(options.retryDelayMs, DEFAULT_RETRY_DELAY_MS);
    const minWindow = timing(options.minPostWindowMs, DEFAULT_MIN_POST_WINDOW_MS);
    const minGap = timing(options.minAttemptDelayMs, DEFAULT_MIN_ATTEMPT_DELAY_MS);
    // 0 is valid: a caller whose own deadline ran out gets a pending result without a POST
    const deadline = Date.now() + timing(options.deadlineMs, DEFAULT_DEADLINE_MS);
    const label = `${KIND_LABELS[request.kind]} ${request.name}`;
    const fail = (message: string, failure: IamPublishFailure, lastStatus: string | null, timedOut = false): IamPublishError =>
        new IamPublishError(message, request.kind, request.name, failure, lastStatus, timedOut);
    const outOfTime = (lastStatus: string | null): IamPublishError =>
        fail(`Publish of ${label} ${IAM_PUBLISH_MESSAGES.pending}: less than ${Math.round(minWindow / MS_PER_SECOND)} s left before the deadline for another attempt; it may still publish`, 'pending', lastStatus, true);
    const headers: Record<string, string> = { 'Accept': request.accept, 'X-sap-adt-sessiontype': 'stateless' };
    if (request.contentType) headers['Content-Type'] = request.contentType;
    let lastStatus: string | null = null;
    let unpublishedRuns = 0;
    let lastAttemptEnd: number | null = null;

    for (;;) {
        if (lastAttemptEnd !== null) await sleep(lastAttemptEnd + minGap - Date.now());
        const remaining = deadline - Date.now();
        if (remaining < minWindow) return err(outOfTime(lastStatus));

        const [response, requestErr] = await client.request({
            method: 'POST',
            path: request.path,
            params: request.params,
            headers,
            timeout: Math.max(1, Math.min(requestTimeout, remaining)),
        });
        lastAttemptEnd = Date.now();

        // SAP keeps publishing after a client timeout; re-posting is safe (overlapping publishes both end 'p').
        if (requestErr?.message === REQUEST_TIMEOUT_MESSAGE) continue;
        if (isTransient(response, requestErr)) {
            await sleep(retryDelay);
            continue;
        }

        const [text, checkErr] = await checkResponse(response, requestErr, `Failed to publish ${label}`);
        if (checkErr) return err(fail(checkErr.message, 'request', lastStatus));

        const status = publishingStatusText(text, request.kind);
        if (status === null) return err(fail(`Publish of ${label}: ${IAM_PUBLISH_MESSAGES.unexpectedResponse} (no publishingStatus): ${text.slice(0, 200)}`, 'response', lastStatus));
        lastStatus = status;
        if (request.doneStatuses.includes(status)) return ok(status);
        if (status !== UNPUBLISHED_STATUS) return err(fail(`Publish of ${label} ${IAM_PUBLISH_MESSAGES.endedWithStatus} '${status}'`, 'status', status));

        unpublishedRuns++;
        if (unpublishedRuns >= MAX_UNPUBLISHED_RUNS) {
            return err(fail(`Publish of ${label} ${IAM_PUBLISH_MESSAGES.pending}: SAP ended ${unpublishedRuns} runs unpublished ('u'); it may still publish`, 'pending', status));
        }
        await sleep(retryDelay);
    }
}

/**
 * publishingStatusText of a publish response ('' when the element is empty or self-closing), or null
 * when the response is not a clean publishingStatus document: another root (with a kind, another
 * namespace than http://www.sap.com/iam/<kind>), no publishingStatusText child, or a message/error child.
 */
export function publishingStatusText(xml: string, kind?: IamObjectKind): string | null {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return null;
    const root = doc.documentElement;
    if (!root || root.localName !== STATUS_ROOT) return null;
    if (kind && root.namespaceURI !== `${IAM_NS_PREFIX}${kind}`) return null;

    let statusText: string | null = null;
    for (let node = root.firstChild; node; node = node.nextSibling) {
        if (node.nodeType !== ELEMENT_NODE) continue;
        const element = node as Element;
        if (PROBLEM_CHILDREN.has(element.localName.toLowerCase())) return null;
        if (element.localName === STATUS_TEXT && statusText === null) statusText = element.textContent?.trim() ?? '';
    }
    return statusText;
}

function isTransient(response: Response | null, requestErr: Error | null): boolean {
    if (requestErr) return TRANSIENT_ERROR.test(requestErr.message) || TRANSIENT_CODES.has(errorCode(requestErr)) || TRANSIENT_CODES.has(errorCode(requestErr.cause));
    return response !== null && TRANSIENT_STATUSES.has(response.status);
}

function errorCode(error: unknown): string {
    if (typeof error !== 'object' || error === null || !('code' in error)) return '';
    return String((error as { code: unknown }).code ?? '').toUpperCase();
}

// A timing option that is not a finite number >= 0 (NaN, negative, Infinity) falls back to the default;
// a request timeout of 0 too (every POST would time out and start another publish on SAP)
function timing(value: number | undefined, fallback: number, positive = false): number {
    if (value === undefined || !Number.isFinite(value)) return fallback;
    return value > 0 || (!positive && value === 0) ? value : fallback;
}

function sleep(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise(resolve => setTimeout(resolve, ms));
}
