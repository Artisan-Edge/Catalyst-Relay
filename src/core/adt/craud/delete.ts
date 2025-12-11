/**
 * Delete — Delete SAP development object
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor } from '../types';
import { checkResponse, requireConfig } from '../helpers';

/**
 * Delete an object from SAP
 *
 * @param client - ADT client
 * @param object - Object reference (name + extension)
 * @param lockHandle - Lock handle from lockObject()
 * @param transport - Transport request (required for non-$TMP packages)
 * @returns void or error
 */
export async function deleteObject(
    client: AdtRequestor,
    object: ObjectRef,
    lockHandle: string,
    transport: string | undefined
): AsyncResult<void, Error> {
    // Validate object extension is supported.
    const [config, configErr] = requireConfig(object.extension);
    if (configErr) return err(configErr);

    // Build request parameters with lock handle.
    const params: Record<string, string> = {
        'lockHandle': lockHandle,
    };
    if (transport) {
        params['corrNr'] = transport;
    }

    // Execute delete request.
    const [response, requestErr] = await client.request({
        method: 'DELETE',
        path: `/sap/bc/adt/${config.endpoint}/${object.name}/source/main`,
        params,
        headers: { 'Accept': 'text/plain' },
    });

    // Validate successful response.
    const [_, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to delete ${config.label} ${object.name}`
    );
    if (checkErr) return err(checkErr);

    return ok(undefined);
}
