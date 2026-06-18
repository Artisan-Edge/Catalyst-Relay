/**
 * Delete — unpublish and delete a service binding
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { checkResponse } from '../helpers';
import { debug } from '../../utils/logging';
import { bindingPath, lockServiceBinding, unlockServiceBinding, submitServiceBindingJob } from './helpers';

/**
 * Delete a service binding.
 *
 * Locks the binding once, unpublishes it (best-effort — it may not be published),
 * then deletes the binding object. A binding has no source, so the delete targets
 * the binding URI directly.
 *
 * @param client - ADT client
 * @param bindingName - Service binding name
 * @param transport - Transport request (required for non-$TMP packages)
 * @returns void or error
 */
export async function deleteServiceBinding(
    client: AdtRequestor,
    bindingName: string,
    transport: string | undefined
): AsyncResult<void, Error> {
    // Lock once for the unpublish + delete sequence.
    const [lockHandle, lockErr] = await lockServiceBinding(client, bindingName);
    if (lockErr) return err(lockErr);

    // Unpublish first; tolerate failure (the binding may not be published).
    const [, unpublishErr] = await submitServiceBindingJob(client, bindingName, 'unpublish');
    if (unpublishErr) debug(`Unpublish before delete skipped: ${unpublishErr.message}`);

    // Delete the binding object.
    const params: Record<string, string> = { lockHandle };
    if (transport) params['corrNr'] = transport;

    const [response, requestErr] = await client.request({
        method: 'DELETE',
        path: bindingPath(bindingName),
        params,
        headers: { 'Accept': 'text/plain' },
    });

    const [, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to delete service binding ${bindingName}`
    );
    if (checkErr) {
        // Delete failed — release the lock so the binding isn't left "editing".
        await unlockServiceBinding(client, bindingName, lockHandle);
        return err(checkErr);
    }

    return ok(undefined);
}
