/**
 * Lock/Unlock — Object lock management for editing
 */

import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { ObjectRef } from '../../types/requests';
import type { AdtRequestor } from './types';
import { extractLockHandle } from '../utils/xml';
import { checkResponse, requireConfig } from './helpers';

/**
 * Lock an object for editing
 *
 * @param client - ADT client
 * @param object - Object reference (name + extension)
 * @returns Lock handle string or error
 */
export async function lockObject(
    client: AdtRequestor,
    object: ObjectRef
): AsyncResult<string, Error> {
    // Validate object extension is supported.
    const [config, configErr] = requireConfig(object.extension);
    if (configErr) return err(configErr);

    // Execute lock request.
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: `/sap/bc/adt/${config.endpoint}/${object.name}/source/main`,
        params: {
            '_action': 'LOCK',
            'accessMode': 'MODIFY',
        },
        headers: {
            'Accept': 'application/*,application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result',
        },
    });

    // Validate successful response.
    const [text, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to lock ${config.label} ${object.name}`
    );
    if (checkErr) return err(checkErr);

    // Extract lock handle from XML response.
    const [lockHandle, extractErr] = extractLockHandle(text);
    if (extractErr) {
        return err(new Error(`Failed to extract lock handle: ${extractErr.message}`));
    }

    return ok(lockHandle);
}

/**
 * Unlock an object after editing
 *
 * @param client - ADT client
 * @param object - Object reference (name + extension)
 * @param lockHandle - Lock handle from lockObject()
 * @returns void or error
 */
export async function unlockObject(
    client: AdtRequestor,
    object: ObjectRef,
    lockHandle: string
): AsyncResult<void, Error> {
    // Validate object extension is supported.
    const [config, configErr] = requireConfig(object.extension);
    if (configErr) return err(configErr);

    // Execute unlock request.
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: `/sap/bc/adt/${config.endpoint}/${object.name}/source/main`,
        params: {
            '_action': 'UNLOCK',
            'lockHandle': lockHandle,
        },
    });

    // Validate successful response.
    const [_, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to unlock ${config.label} ${object.name}`
    );
    if (checkErr) return err(checkErr);

    return ok(undefined);
}
