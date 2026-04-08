/**
 * Delete Transport — Delete a transport request
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { extractError } from '../../utils/xml';
import { getTransportContents } from './getTransportContents';
import { removeFromTransport } from './removeFromTransport';

const ACCEPT_HEADER = 'application/vnd.sap.adt.transportorganizer.v1+xml';

/**
 * Delete a transport request
 *
 * @param client - ADT client
 * @param transportId - Transport request ID (e.g., 'DS4K904713')
 * @param removeObjects - If true, removes all objects from the transport before deleting
 * @returns void on success or error
 */
export async function deleteTransport(
    client: AdtRequestor,
    transportId: string,
    removeObjects = false
): AsyncResult<void, Error> {
    // Remove all objects from the transport first if requested.
    if (removeObjects) {
        const [objects, contentsErr] = await getTransportContents(client, transportId);
        if (contentsErr) return err(contentsErr);

        for (const object of objects) {
            const [, removeErr] = await removeFromTransport(client, transportId, object);
            if (removeErr) return err(removeErr);
        }
    }

    // Delete the transport.
    const [response, requestErr] = await client.request({
        method: 'DELETE',
        path: `/sap/bc/adt/cts/transportrequests/${transportId}`,
        headers: {
            'Accept': ACCEPT_HEADER,
        },
    });

    if (requestErr) return err(requestErr);
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Failed to delete transport ${transportId}: ${errorMsg}`));
    }

    return ok(undefined);
}
