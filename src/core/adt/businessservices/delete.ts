/**
 * Delete — unpublish and delete a service binding
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { ServiceBindingVersion } from './types';
import { checkResponse } from '../helpers';
import { debug } from '../../utils/logging';
import { bindingPath, lockServiceBinding, unlockServiceBinding, submitServiceBindingJob, ODATA_BINDING_TYPE } from './helpers';
import { readServiceBinding } from './read';

/**
 * Delete a service binding.
 *
 * Reads the binding, locks it, unpublishes it (best effort — it may not be published),
 * DELETEs the binding URI and unlocks. Unpublish jobs run only for a binding read back
 * as ODATA: a failed read, an InA binding or another type (SQL) is just locked, deleted
 * and unlocked, since an OData job on a non-OData binding dumps and ends the session.
 * Unpublish version: `version` when given, else the one read back, else V4 then V2.
 * The lock is released after the DELETE too (SAP keeps it, blocking a re-create of the name).
 *
 * Deleting an InA binding also drops its INA1 service from every IAM app that lists it.
 *
 * @param client - ADT client
 * @param bindingName - Service binding name
 * @param transport - Transport request (packages that record changes)
 * @param version - OData version to unpublish; takes precedence over the version read back
 * @returns void or error
 */
export async function deleteServiceBinding(
    client: AdtRequestor,
    bindingName: string,
    transport: string | undefined,
    version?: ServiceBindingVersion
): AsyncResult<void, Error> {
    // A failed read means the type is unknown: no unpublish jobs. A missing binding fails at the lock.
    const [binding, readErr] = await readServiceBinding(client, bindingName);
    if (readErr) debug(`Reading service binding ${bindingName} before delete failed: ${readErr.message}`);
    const isOData = binding?.bindingType.toUpperCase() === ODATA_BINDING_TYPE;

    // Lock once for the unpublish + delete sequence.
    const [lockHandle, lockErr] = await lockServiceBinding(client, bindingName);
    if (lockErr) return err(lockErr);

    // Unpublish first; tolerate failure (the binding may not be published).
    const versions: ServiceBindingVersion[] = isOData ? unpublishVersions(binding?.odataVersion, version) : [];
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

    // Release the lock on every path: SAP keeps it after the DELETE, blocking a re-create of the name
    // ("currently editing"). Best effort: a failed unlock doesn't undo the delete.
    const [, unlockErr] = await unlockServiceBinding(client, bindingName, lockHandle);
    if (unlockErr) debug(`Unlock after deleting service binding ${bindingName} failed: ${unlockErr.message}`);
    if (checkErr) return err(checkErr);

    return ok(undefined);
}

// The caller's version, else the one read back, else V4 then V2.
function unpublishVersions(readVersion: string | undefined, requested: ServiceBindingVersion | undefined): ServiceBindingVersion[] {
    if (requested) return [requested];
    const known = readVersion?.toUpperCase();
    if (known === 'V4' || known === 'V2') return [known];
    return ['V4', 'V2'];
}
