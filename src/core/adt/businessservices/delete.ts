/**
 * Delete — unpublish and delete a service binding
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { ServiceBindingVersion } from './types';
import { checkResponse } from '../helpers';
import { debug } from '../../utils/logging';
import { bindingPath, lockServiceBinding, unlockServiceBinding, submitServiceBindingJob } from './helpers';

/**
 * Delete a service binding.
 *
 * Locks the binding once, unpublishes it (best-effort — it may not be published),
 * then deletes the binding object. A binding has no source, so the delete targets
 * the binding URI directly. Without a version the V4 unpublish is tried first and
 * the V2 unpublish only when that fails.
 *
 * @param client - ADT client
 * @param bindingName - Service binding name
 * @param transport - Transport request (required for non-$TMP packages)
 * @param version - OData version of the binding; omitted, both are tried
 * @returns void or error
 */
export async function deleteServiceBinding(
    client: AdtRequestor,
    bindingName: string,
    transport: string | undefined,
    version?: ServiceBindingVersion
): AsyncResult<void, Error> {
    // Lock once for the unpublish + delete sequence.
    const [lockHandle, lockErr] = await lockServiceBinding(client, bindingName);
    if (lockErr) return err(lockErr);

    // Unpublish first; tolerate failure (the binding may not be published).
    const versions: ServiceBindingVersion[] = version ? [version] : ['V4', 'V2'];
    for (const candidate of versions) {
        const [, unpublishErr] = await submitServiceBindingJob(client, bindingName, 'unpublish', candidate);
        if (!unpublishErr) break;
        debug(`${candidate} unpublish before delete skipped: ${unpublishErr.message}`);
    }

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
