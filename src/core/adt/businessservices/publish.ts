/**
 * Publish / Unpublish — expose or retract a service binding's OData service
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { debug } from '../../utils/logging';
import { lockServiceBinding, unlockServiceBinding, submitServiceBindingJob } from './helpers';

/**
 * Publish a service binding.
 *
 * Locks the binding, submits an OData V4 publish job exposing its entity sets,
 * then releases the lock.
 *
 * @param client - ADT client
 * @param bindingName - Service binding name
 * @returns Publish message (SHORT_TEXT) or error
 */
export async function publishServiceBinding(
    client: AdtRequestor,
    bindingName: string
): AsyncResult<string, Error> {
    return runBindingJob(client, bindingName, 'publish');
}

/**
 * Unpublish a service binding.
 *
 * Locks the binding, submits an OData V4 unpublish job retracting the exposed
 * service, then releases the lock. Required before a published binding can be deleted.
 *
 * @param client - ADT client
 * @param bindingName - Service binding name
 * @returns Unpublish message (SHORT_TEXT) or error
 */
export async function unpublishServiceBinding(
    client: AdtRequestor,
    bindingName: string
): AsyncResult<string, Error> {
    return runBindingJob(client, bindingName, 'unpublish');
}

// Lock → submit (un)publish job → always unlock.
async function runBindingJob(
    client: AdtRequestor,
    bindingName: string,
    action: 'publish' | 'unpublish'
): AsyncResult<string, Error> {
    const [lockHandle, lockErr] = await lockServiceBinding(client, bindingName);
    if (lockErr) return err(lockErr);
    debug(`Service binding lock acquired for ${action}: handle=${lockHandle}`);

    const [message, jobErr] = await submitServiceBindingJob(client, bindingName, action);

    // Always release the lock, even if the job failed.
    const [, unlockErr] = await unlockServiceBinding(client, bindingName, lockHandle);

    if (jobErr) return err(jobErr);
    if (unlockErr) return err(unlockErr);
    return ok(message);
}
