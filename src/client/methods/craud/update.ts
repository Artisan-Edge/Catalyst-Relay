/**
 * Update object method
 */

import type { AsyncResult } from '../../../types/result';
import type { ObjectRef, ObjectContent } from '../../../types/requests';
import type { AdtRequestor } from '../../../core/adt';
import type { ClientState } from '../../types';
import { ok, err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function update(
    state: ClientState,
    requestor: AdtRequestor,
    object: ObjectContent,
    transport?: string
): AsyncResult<void> {
    if (!state.session) return err(new Error('Not logged in'));

    const objRef: ObjectRef = { name: object.name, extension: object.extension };

    // Lock object before update
    const [lockHandle, lockErr] = await adt.lockObject(requestor, objRef);
    if (lockErr) return err(lockErr);

    // Update object content
    const [, updateErr] = await adt.updateObject(requestor, object, lockHandle, transport);

    // Always unlock after update attempt
    const [, unlockErr] = await adt.unlockObject(requestor, objRef, lockHandle);

    // Return first error encountered
    if (updateErr) return err(updateErr);
    if (unlockErr) return err(unlockErr);

    return ok(undefined);
}
