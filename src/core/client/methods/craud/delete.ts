/**
 * Delete objects method
 */

import type { AsyncResult } from '../../../../types/result';
import type { ObjectRef } from '../../../../types/requests';
import type { AdtRequestor } from '../../../adt';
import type { ClientState } from '../../types';
import { ok, err } from '../../../../types/result';
import * as adt from '../../../adt';

export async function deleteObjects(
    state: ClientState,
    requestor: AdtRequestor,
    objects: ObjectRef[],
    transport?: string
): AsyncResult<void> {
    if (!state.session) return err(new Error('Not logged in'));

    for (const obj of objects) {
        // Lock object before deletion
        const [lockHandle, lockErr] = await adt.lockObject(requestor, obj);
        if (lockErr) return err(lockErr);

        // Delete object
        const [, deleteErr] = await adt.deleteObject(requestor, obj, lockHandle, transport);
        if (deleteErr) {
            // Attempt to unlock on failure
            await adt.unlockObject(requestor, obj, lockHandle);
            return err(deleteErr);
        }
    }
    return ok(undefined);
}
