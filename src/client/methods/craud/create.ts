/**
 * Create object method
 */

import type { AsyncResult } from '../../../types/result';
import type { ObjectRef, ObjectContent } from '../../../types/requests';
import type { AdtRequestor } from '../../../core/adt';
import type { ClientState } from '../../types';
import { ok, err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function create(
    state: ClientState,
    requestor: AdtRequestor,
    object: ObjectContent,
    packageName: string,
    transport?: string
): AsyncResult<void> {
    if (!state.session) return err(new Error('Not logged in'));
    const config = adt.getConfigByExtension(object.extension);

    // Nested objects (function modules) need their container to exist first
    if (config?.container && object.container) {
        const [, groupErr] = await adt.ensureFunctionGroup(requestor, object.container, packageName, transport, state.session.username);
        if (groupErr) return err(groupErr);
    }

    // Step 1: Create the object (form objects are created complete in one POST)
    const [, createErr] = await adt.createObject(requestor, object, packageName, transport, state.session.username);
    if (createErr) return err(createErr);
    if (config?.kind === 'form') return ok(undefined);

    // Step 2: Populate content via lock → update → unlock
    const objRef: ObjectRef = { name: object.name, extension: object.extension };
    if (object.container) objRef.container = object.container;

    const [lockHandle, lockErr] = await adt.lockObject(requestor, objRef);
    if (lockErr) return err(lockErr);

    const [, updateErr] = await adt.updateObject(requestor, object, lockHandle, transport);

    // Always unlock after update attempt
    const [, unlockErr] = await adt.unlockObject(requestor, objRef, lockHandle);

    if (updateErr) return err(updateErr);
    if (unlockErr) return err(unlockErr);

    return ok(undefined);
}
