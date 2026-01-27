/**
 * Create object method
 */

import type { AsyncResult } from '../../../../types/result';
import type { ObjectRef, ObjectContent } from '../../../../types/requests';
import type { AdtRequestor } from '../../../adt';
import type { ClientState } from '../../types';
import { ok, err } from '../../../../types/result';
import * as adt from '../../../adt';

export async function create(
    state: ClientState,
    requestor: AdtRequestor,
    object: ObjectContent,
    packageName: string,
    transport?: string
): AsyncResult<void> {
    if (!state.session) return err(new Error('Not logged in'));

    // Step 1: Create empty object shell
    const [, createErr] = await adt.createObject(requestor, object, packageName, transport, state.session.username);
    if (createErr) return err(createErr);

    // Step 2: Populate content via lock → update → unlock
    const objRef: ObjectRef = { name: object.name, extension: object.extension };

    const [lockHandle, lockErr] = await adt.lockObject(requestor, objRef);
    if (lockErr) return err(lockErr);

    const [, updateErr] = await adt.updateObject(requestor, object, lockHandle, transport);

    // Always unlock after update attempt
    const [, unlockErr] = await adt.unlockObject(requestor, objRef, lockHandle);

    if (updateErr) return err(updateErr);
    if (unlockErr) return err(unlockErr);

    return ok(undefined);
}
