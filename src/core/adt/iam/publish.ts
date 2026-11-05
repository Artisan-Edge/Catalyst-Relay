/**
 * IAM Publish — "Publish Locally" for IAM apps, business catalogs and role templates, waiting for completion
 *
 * The publish POST is synchronous: SAP answers after about two minutes with the final
 * publishingStatusText. publishStatus on the object is no signal (a never-published app reads 'p').
 * It takes no lock, so it runs stateless: the stateful session stays free, and a re-post after a
 * client timeout does not queue behind the first publish in that session.
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { IamPublishOptions } from './types';
import { checkResponse } from '../helpers';
import { REQUEST_TIMEOUT_MESSAGE } from '../../utils/headers';

const IN_PROGRESS_STATUS = 'u';
const DEFAULT_REQUEST_TIMEOUT_MS = 300_000;
const DEFAULT_RETRY_DELAY_MS = 30_000;
const DEFAULT_DEADLINE_MS = 600_000;
const MS_PER_MINUTE = 60_000;
// Gateway errors and dropped connections: the publish may still be running, so re-post.
const TRANSIENT_STATUSES = new Set([502, 504]);
const TRANSIENT_ERROR = /socket hang up|ECONNRESET/i;

export interface IamPublishRequest {
    path: string;
    /** Query parameters naming the object */
    params: Record<string, string>;
    accept: string;
    /** "<kind> <NAME>" for messages */
    label: string;
    /** publishingStatusText values that mean the publish finished */
    doneStatuses: readonly string[];
}

/**
 * POST a publish (stateless) and wait for it to finish.
 *
 * A client timeout re-posts at once; a 502/504 or a dropped connection, and 'u' (another publish
 * still running), wait and re-post. Each request's timeout is capped at the time left before the
 * deadline. A done status in a publishingStatus document ends the wait; anything else is an error.
 *
 * @param client - ADT client
 * @param request - Publish endpoint and the statuses that mean done
 * @param options - Timeouts (defaults: 300 s per request, 30 s between re-posts, 10 min overall)
 * @returns The final publishingStatusText or error
 */
export async function publishAndWait(
    client: AdtRequestor,
    request: IamPublishRequest,
    options: IamPublishOptions = {}
): AsyncResult<string, Error> {
    const requestTimeout = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const retryDelay = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
    const deadline = Date.now() + deadlineMs;
    const minutes = Math.round(deadlineMs / MS_PER_MINUTE);
    const unfinished = (state: string): Error => new Error(`Publish of ${request.label} ${state} after ${minutes} min`);

    for (let attempt = 0; ; attempt++) {
        const remaining = deadline - Date.now();
        if (attempt > 0 && remaining <= 0) return err(unfinished('did not finish'));

        const [response, requestErr] = await client.request({
            method: 'POST',
            path: request.path,
            params: request.params,
            headers: { 'Accept': request.accept, 'X-sap-adt-sessiontype': 'stateless' },
            timeout: Math.max(1, Math.min(requestTimeout, remaining)),
        });

        // SAP keeps publishing after a client timeout; re-post to learn the outcome.
        if (requestErr?.message === REQUEST_TIMEOUT_MESSAGE) continue;
        if (isTransient(response, requestErr)) {
            if (Date.now() + retryDelay >= deadline) return err(unfinished('did not finish'));
            await sleep(retryDelay);
            continue;
        }

        const [text, checkErr] = await checkResponse(response, requestErr, `Failed to publish ${request.label}`);
        if (checkErr) return err(checkErr);

        const status = publishingStatusText(text);
        if (status === null) return err(new Error(`Publish of ${request.label}: unexpected response (no publishingStatus): ${text.slice(0, 200)}`));
        if (request.doneStatuses.includes(status)) return ok(status);
        if (status !== IN_PROGRESS_STATUS) return err(new Error(`Publish of ${request.label} ended with status '${status}'`));
        if (Date.now() + retryDelay >= deadline) return err(unfinished('still in progress'));
        await sleep(retryDelay);
    }
}

/**
 * publishingStatusText of a publish response: '' when the element is empty or absent inside a
 * publishingStatus document, null when the response is not one (e.g. an HTML logon page).
 * The prefix varies (sia1:/sia6:).
 */
export function publishingStatusText(xml: string): string | null {
    if (!/<(?:[\w-]+:)?publishingStatus[\s>/]/.test(xml)) return null;
    const match = xml.match(/<(?:[\w-]+:)?publishingStatusText>([^<]*)</);
    return match?.[1]?.trim() ?? '';
}

function isTransient(response: Response | null, requestErr: Error | null): boolean {
    if (requestErr) return TRANSIENT_ERROR.test(requestErr.message);
    return response !== null && TRANSIENT_STATUSES.has(response.status);
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
