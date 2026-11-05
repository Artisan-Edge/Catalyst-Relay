/**
 * Lock/Unlock — Object lock management for editing
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor } from '../types';
import { extractLockHandle } from '../../utils/xml';
import { checkResponse, lockUri, requireConfig } from '../helpers';
import { debug } from '../../utils/logging';

const LOCK_ACCEPT = 'application/*,application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result';

/**
 * Lock any lockable ADT URI (object, metadata document, text pool) for editing
 *
 * @param client - ADT client
 * @param uri - URI to lock
 * @param label - What is locked, for error messages (e.g. "Class ZCL_FOO")
 * @returns Lock handle or error
 */
export async function acquireLock(client: AdtRequestor, uri: string, label: string): AsyncResult<string, Error> {
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: uri,
        params: { '_action': 'LOCK', 'accessMode': 'MODIFY' },
        headers: { 'Accept': LOCK_ACCEPT },
    });
    const [text, checkErr] = await checkResponse(response, requestErr, `Failed to lock ${label}`);
    if (checkErr) return err(checkErr);

    const [lockHandle, extractErr] = extractLockHandle(text);
    if (extractErr) return err(new Error(`Failed to extract lock handle: ${extractErr.message}`));
    debug(`Lock acquired: handle=${lockHandle}`);
    return ok(lockHandle);
}

/**
 * Release a lock taken with acquireLock
 */
export async function releaseLock(client: AdtRequestor, uri: string, lockHandle: string, label: string): AsyncResult<void, Error> {
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: uri,
        params: { '_action': 'UNLOCK', 'lockHandle': lockHandle },
    });
    const [, checkErr] = await checkResponse(response, requestErr, `Failed to unlock ${label}`);
    if (checkErr) return err(checkErr);
    return ok(undefined);
}

/**
 * Lock an object for editing
 *
 * @param client - ADT client
 * @param object - Object reference (name + extension)
 * @returns Lock handle string or error
 */
export async function lockObject(client: AdtRequestor, object: ObjectRef): AsyncResult<string, Error> {
    const [config, configErr] = requireConfig(object.extension);
    if (configErr) return err(configErr);
    const [path, pathErr] = lockUri(config, object);
    if (pathErr) return err(pathErr);
    return acquireLock(client, path, `${config.label} ${object.name}`);
}

/**
 * Unlock an object after editing
 *
 * @param client - ADT client
 * @param object - Object reference (name + extension)
 * @param lockHandle - Lock handle from lockObject()
 * @returns void or error
 */
export async function unlockObject(client: AdtRequestor, object: ObjectRef, lockHandle: string): AsyncResult<void, Error> {
    const [config, configErr] = requireConfig(object.extension);
    if (configErr) return err(configErr);
    const [path, pathErr] = lockUri(config, object);
    if (pathErr) return err(pathErr);
    return releaseLock(client, path, lockHandle, `${config.label} ${object.name}`);
}
