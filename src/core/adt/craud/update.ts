/**
 * Update — Update existing SAP development object
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { ObjectContent } from '../../../types/requests';
import type { AdtRequestor } from '../types';
import { checkResponse, requireConfig } from '../helpers';
import { debug } from '../../utils/logging';

/**
 * Update an existing object's source content
 *
 * @param client - ADT client
 * @param object - Object with new content
 * @param lockHandle - Lock handle from lockObject()
 * @param transport - Transport request (required for non-$TMP packages)
 * @returns void or error
 */
export async function updateObject(
    client: AdtRequestor,
    object: ObjectContent,
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

    // Execute update request to ADT server.
    debug(`Update ${object.name}: content length=${object.content?.length ?? 0}`);
    const [response, requestErr] = await client.request({
        method: 'PUT',
        path: `/sap/bc/adt/${config.endpoint}/${object.name}/source/main`,
        params,
        headers: { 'Content-Type': '*/*' },
        body: object.content,
    });
    debug(`Update response: ${response?.status ?? 'no response'}, err=${requestErr?.message ?? 'none'}`);

    // Validate successful response.
    const [_, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to update ${config.label} ${object.name}`
    );
    if (checkErr) return err(checkErr);

    return ok(undefined);
}
