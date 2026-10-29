/**
 * Publish / Unpublish — expose or retract a service binding's OData service
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { ServiceBindingVersion } from './types';
import { debug } from '../../utils/logging';
import { lockServiceBinding, unlockServiceBinding, submitServiceBindingJob } from './helpers';
import { readServiceBinding } from './read';

type BindingJobAction = 'publish' | 'unpublish';

/**
 * Publish a service binding.
 *
 * Locks the binding, submits an OData publish job (V4 or V2) exposing its entity
 * sets, then releases the lock.
 *
 * @param client - ADT client
 * @param bindingName - Service binding name
 * @param version - OData version of the binding (default: 'V4')
 * @returns Publish message (SHORT_TEXT) or error
 */
export async function publishServiceBinding(
    client: AdtRequestor,
    bindingName: string,
    version: ServiceBindingVersion = 'V4'
): AsyncResult<string, Error> {
    return runBindingJob(client, bindingName, 'publish', version);
}

/**
 * Unpublish a service binding.
 *
 * Locks the binding, submits an OData unpublish job (V4 or V2) retracting the
 * exposed service, then releases the lock. Required before a published binding can be deleted.
 *
 * @param client - ADT client
 * @param bindingName - Service binding name
 * @param version - OData version of the binding (default: 'V4')
 * @returns Unpublish message (SHORT_TEXT) or error
 */
export async function unpublishServiceBinding(
    client: AdtRequestor,
    bindingName: string,
    version: ServiceBindingVersion = 'V4'
): AsyncResult<string, Error> {
    return runBindingJob(client, bindingName, 'unpublish', version);
}

// Lock → submit (un)publish job → always unlock.
async function runBindingJob(
    client: AdtRequestor,
    bindingName: string,
    action: BindingJobAction,
    version: ServiceBindingVersion
): AsyncResult<string, Error> {
    const [lockHandle, lockErr] = await lockServiceBinding(client, bindingName);
    if (lockErr) return err(lockErr);
    debug(`Service binding lock acquired for ${action}: handle=${lockHandle}`);

    const [message, jobErr] = await submitServiceBindingJob(client, bindingName, action, version);

    // Always release the lock, even if the job failed.
    const [, unlockErr] = await unlockServiceBinding(client, bindingName, lockHandle);

    if (jobErr) return err(jobErr);
    if (!unlockErr) return ok(message);

    const [, recoverErr] = await recoverFailedUnlock(client, bindingName, lockHandle, action, unlockErr);
    if (recoverErr) return err(recoverErr);
    return ok(message);
}

// A first V2 publish can dump in the unlock (OBJECTS_OBJREF_NOT_ASSIGNED); the dump ends the stateful session and its lock.
async function recoverFailedUnlock(
    client: AdtRequestor,
    bindingName: string,
    lockHandle: string,
    action: BindingJobAction,
    unlockErr: Error
): AsyncResult<void, Error> {
    debug(`Service binding unlock after ${action} failed: ${unlockErr.message}`);

    // Retry once so a lock still held by a surviving session context is released.
    const [, retryErr] = await unlockServiceBinding(client, bindingName, lockHandle);
    if (!retryErr) return ok(undefined);
    debug(`Service binding unlock retry failed: ${retryErr.message}`);

    // The job reported success; accept it only when the binding shows the state the job was meant to reach.
    const [binding, readErr] = await readServiceBinding(client, bindingName);
    if (readErr || !binding) return err(unlockErr);
    if (binding.published !== (action === 'publish')) return err(unlockErr);

    debug(`Service binding ${bindingName} ${action} confirmed by its publish state despite the unlock failure`);
    return ok(undefined);
}
