/**
 * Service binding helpers — shared lock and publish-job submission
 *
 * Internal helpers used across the businessservices files. Not exported from the
 * adt/ barrel.
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { extractLockHandle, extractTagText } from '../../utils/xml';
import { checkResponse } from '../helpers';

export const BINDINGS_BASE_PATH = '/sap/bc/adt/businessservices/bindings';

const LOCK_ACCEPT_HEADER =
    'application/*,application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result';
const PUBLISH_JOBS_PATH = '/sap/bc/adt/businessservices/odatav4/publishjobs';
const UNPUBLISH_JOBS_PATH = '/sap/bc/adt/businessservices/odatav4/unpublishjobs';
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
 * @returns Job message (SHORT_TEXT) or error
 */
export async function submitServiceBindingJob(
    client: AdtRequestor,
    bindingName: string,
    action: 'publish' | 'unpublish'
): AsyncResult<string, Error> {
    const path = action === 'publish' ? PUBLISH_JOBS_PATH : UNPUBLISH_JOBS_PATH;

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:type="SCGR" adtcore:name="${bindingName.toUpperCase()}"/>
</adtcore:objectReferences>`;

    const [response, requestErr] = await client.request({
        method: 'POST',
        path,
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
