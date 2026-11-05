/**
 * With Lock — lock → work → unlock, unlocking on every path
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor, LockTarget } from '../types';
import { acquireLock, releaseLock } from './lock';

/**
 * Run fn under a lock of target.uri and always release it afterwards
 *
 * A failure of fn wins over a failed unlock (both are reported); a failed unlock after a
 * successful fn is returned as the error, since the object stays locked.
 *
 * @param client - ADT client
 * @param target - URI to lock and its label
 * @param fn - Work to do with the lock handle
 * @returns fn's result, or the first error
 */
export async function withLock<T>(client: AdtRequestor, target: LockTarget, fn: (lockHandle: string) => AsyncResult<T, Error>): AsyncResult<T, Error> {
    const [lockHandle, lockErr] = await acquireLock(client, target.uri, target.label);
    if (lockErr) return err(lockErr);

    const [value, fnErr] = await fn(lockHandle);
    const [, unlockErr] = await releaseLock(client, target.uri, lockHandle, target.label);

    if (fnErr) return err(unlockErr ? new Error(`${fnErr.message} (and ${unlockErr.message})`) : fnErr);
    if (unlockErr) return err(unlockErr);
    return ok(value);
}
