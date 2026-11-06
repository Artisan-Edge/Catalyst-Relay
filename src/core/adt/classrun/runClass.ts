/**
 * Run Class — execute a class implementing IF_OO_ADT_CLASSRUN and return its console output
 *
 * Always stateless (no context cookie): a stateful ADT session keeps the class load after the
 * first run and runs the old code after a re-activation. The request runs in a short-lived context
 * of its own, so it sees no locks or buffers of the stateful session and leaves them alone.
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { RunClassOptions } from './types';
import { checkResponse } from '../helpers';
import { REQUEST_TIMEOUT_MESSAGE } from '../../utils/headers';

const CLASSRUN_PATH = '/sap/bc/adt/oo/classrun/';
const DUMPS_PATH = '/sap/bc/adt/runtime/dumps';
const DEFAULT_TIMEOUT_MS = 300_000;
const MS_PER_SECOND = 1000;
const INTERNAL_SERVER_ERROR = 500;
const SHORT_TEXT_LENGTH = 300;
// SAP answers 200 with this text for a class that does not exist
const NOT_FOUND = /^Object \S+ of type CLAS does not exist\.?\s*$/;
const HTML_PAGE = /^\s*<(!doctype\s+html|html)[\s>]/i;

/**
 * POST /oo/classrun/<class> (stateless, Accept text/plain).
 *
 * @param client - ADT client
 * @param className - Class name
 * @param options - Timeout
 * @returns The console text, or error (HTTP 500: the run dumped; class not found; an HTML page,
 *   e.g. a logon page — also refused when a class's own output starts with <html> or <!doctype html>)
 */
export async function runClass(client: AdtRequestor, className: string, options: RunClassOptions = {}): AsyncResult<string, Error> {
    const name = className.trim().toUpperCase();
    if (!name) return err(new Error('Class run: class name is required'));
    const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: `${CLASSRUN_PATH}${encodeURIComponent(name.toLowerCase())}`,
        headers: { 'Accept': 'text/plain', 'X-sap-adt-sessiontype': 'stateless' },
        timeout,
    });
    if (requestErr?.message === REQUEST_TIMEOUT_MESSAGE) {
        return err(new Error(`Class run of ${name} timed out after ${Math.round(timeout / MS_PER_SECOND)} s; it may still be running on SAP`));
    }
    if (response?.status === INTERNAL_SERVER_ERROR) return err(dumpError(name, await response.text()));

    const [text, checkErr] = await checkResponse(response, requestErr, `Class run of ${name} failed`);
    if (checkErr) return err(checkErr);
    if (NOT_FOUND.test(text.trim())) return err(new Error(`Class run of ${name} failed: ${text.trim()}`));
    // A 200 HTML page is not console output (a logon or error page)
    if (HTML_PAGE.test(text) || /text\/html/i.test(response?.headers.get('content-type') ?? '')) return err(new Error(`Class run of ${name} failed: unexpected HTML response: ${text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, SHORT_TEXT_LENGTH)}`));
    return ok(text);
}

// The 500 page carries only the dump's short text
function dumpError(name: string, body: string): Error {
    const shortText = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, SHORT_TEXT_LENGTH);
    const detail = shortText ? `: ${shortText}` : '';
    return new Error(`Class run of ${name} dumped (HTTP 500)${detail}. See the short dumps at ${DUMPS_PATH} (a dump in CL_ABAP_DOCU_CLASS_POOL happens before the class runs)`);
}
