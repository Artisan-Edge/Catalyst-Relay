/**
 * Service binding helpers — shared lock and publish-job submission
 *
 * Internal helpers used across the businessservices files. Not exported from the
 * adt/ barrel.
 */

import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { ServiceBindingCategory, ServiceBindingVersion } from './types';
import { extractLockHandle, extractTagText } from '../../utils/xml';
import { checkResponse } from '../helpers';

export const BINDINGS_BASE_PATH = '/sap/bc/adt/businessservices/bindings';

const LOCK_ACCEPT_HEADER =
    'application/*,application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result';
export const BINDING_ACCEPT_HEADER = 'application/vnd.sap.adt.businessservices.servicebinding.v2+xml, application/*';
const JOBS_BASE_PATH = '/sap/bc/adt/businessservices';
// V2 (un)publish jobs name the service and its version as query parameters; bindings start at version 0001.
const V2_SERVICE_VERSION = '0001';
// A public cloud publish job runs well past the default request timeout.
const PUBLISH_JOB_TIMEOUT_MS = 300_000;

// srvb:category codes
const CATEGORY_CODES: Record<ServiceBindingCategory, string> = { UI: '0', WEB_API: '1' };

// Severities that let the operation proceed; INFO is advice (e.g. "V4 without draft is primarily read-only").
const PASSING_SEVERITIES = new Set(['OK', 'INFO']);
const WARNING_SEVERITY = 'WARNING';

/** srvb:category code for a binding category. */
export function bindingCategoryCode(category: ServiceBindingCategory): string {
    return CATEGORY_CODES[category];
}

/** Binding category for a srvb:category code, or null when the code is unknown. */
export function bindingCategoryFromCode(code: string): ServiceBindingCategory | null {
    const match = (Object.keys(CATEGORY_CODES) as ServiceBindingCategory[]).find(category => CATEGORY_CODES[category] === code);
    return match ?? null;
}

/**
 * Judge the SEVERITY / SHORT_TEXT of a validation or job response.
 *
 * OK and INFO pass; WARNING passes only when allowed; anything else (ERROR) fails.
 * A passing non-OK severity comes back as a note.
 *
 * @param text - Response body
 * @param operation - Operation name for the error message
 * @param allowWarnings - Whether a WARNING passes
 * @returns Notes (empty for OK) or error
 */
export function judgeSeverity(text: string, operation: string, allowWarnings = false): Result<string[], Error> {
    const severity = extractTagText(text, 'SEVERITY');
    if (!severity || severity === 'OK') return ok([]);

    const shortText = extractTagText(text, 'SHORT_TEXT') ?? '';
    const passes = PASSING_SEVERITIES.has(severity) || (allowWarnings && severity === WARNING_SEVERITY);
    if (!passes) return err(new Error(`${operation} failed (${severity}): ${shortText}`));

    return ok(shortText ? [`${severity}: ${shortText}`] : []);
}

/** ADT resource path for a service binding. */
export function bindingPath(bindingName: string): string {
    return `${BINDINGS_BASE_PATH}/${bindingName.toLowerCase()}`;
}

/**
 * Lock a service binding for modification.
 *
 * @param client - ADT client
 * @param bindingName - Service binding name
 * @returns Lock handle or error
 */
export async function lockServiceBinding(
    client: AdtRequestor,
    bindingName: string
): AsyncResult<string, Error> {
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: bindingPath(bindingName),
        params: {
            '_action': 'LOCK',
            'accessMode': 'MODIFY',
        },
        headers: { 'Accept': LOCK_ACCEPT_HEADER },
    });

    const [text, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to lock service binding ${bindingName}`
    );
    if (checkErr) return err(checkErr);

    const [lockHandle, extractErr] = extractLockHandle(text);
    if (extractErr) return err(new Error(`Failed to extract lock handle: ${extractErr.message}`));

    return ok(lockHandle);
}

/**
 * Unlock a service binding.
 *
 * @param client - ADT client
 * @param bindingName - Service binding name
 * @param lockHandle - Lock handle from lockServiceBinding()
 * @returns void or error
 */
export async function unlockServiceBinding(
    client: AdtRequestor,
    bindingName: string,
    lockHandle: string
): AsyncResult<void, Error> {
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: bindingPath(bindingName),
        params: {
            '_action': 'UNLOCK',
            'lockHandle': lockHandle,
        },
    });

    const [, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to unlock service binding ${bindingName}`
    );
    if (checkErr) return err(checkErr);

    return ok(undefined);
}

/**
 * Submit a publish or unpublish job for an (already-locked) service binding.
 *
 * @param client - ADT client
 * @param bindingName - Service binding name
 * @param action - 'publish' or 'unpublish'
 * @param version - OData version of the binding (default: 'V4')
 * @returns Job message (SHORT_TEXT) or error
 */
export async function submitServiceBindingJob(
    client: AdtRequestor,
    bindingName: string,
    action: 'publish' | 'unpublish',
    version: ServiceBindingVersion = 'V4'
): AsyncResult<string, Error> {
    const path = `${JOBS_BASE_PATH}/odata${version.toLowerCase()}/${action}jobs`;
    const params: Record<string, string> = version === 'V2'
        ? { servicename: bindingName.toUpperCase(), serviceversion: V2_SERVICE_VERSION }
        : {};

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:type="SCGR" adtcore:name="${bindingName.toUpperCase()}"/>
</adtcore:objectReferences>`;

    const [response, requestErr] = await client.request({
        method: 'POST',
        path,
        params,
        headers: { 'Content-Type': 'application/xml' },
        body,
        timeout: PUBLISH_JOB_TIMEOUT_MS,
    });

    const [text, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to ${action} service binding ${bindingName}`
    );
    if (checkErr) return err(checkErr);

    const [, severityErr] = judgeSeverity(text, `Service binding ${action}`);
    if (severityErr) return err(severityErr);

    return ok(extractTagText(text, 'SHORT_TEXT') ?? '');
}
