/**
 * Service binding helpers — shared lock and publish-job submission
 *
 * Internal helpers used across the businessservices files. Not exported from the
 * adt/ barrel.
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { ServiceBindingVersion } from './types';
import { extractLockHandle, extractTagText } from '../../utils/xml';
import { checkResponse } from '../helpers';

export const BINDINGS_BASE_PATH = '/sap/bc/adt/businessservices/bindings';

const LOCK_ACCEPT_HEADER =
    'application/*,application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result';
const JOBS_BASE_PATH = '/sap/bc/adt/businessservices';
// V2 (un)publish jobs name the service and its version as query parameters; bindings start at version 0001.
const V2_SERVICE_VERSION = '0001';
const SEVERITY_OK = 'OK';

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
    });

    const [text, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to ${action} service binding ${bindingName}`
    );
    if (checkErr) return err(checkErr);

    const severity = extractTagText(text, 'SEVERITY');
    if (severity && severity !== SEVERITY_OK) {
        const shortText = extractTagText(text, 'SHORT_TEXT') ?? '';
        return err(new Error(`Service binding ${action} failed (${severity}): ${shortText}`));
    }

    return ok(extractTagText(text, 'SHORT_TEXT') ?? '');
}
