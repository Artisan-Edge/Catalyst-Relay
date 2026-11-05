/**
 * Create object method
 */

import type { AsyncResult } from '../../../types/result';
import type { ObjectContent } from '../../../types/requests';
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

    // Nested objects (function modules, includes) need their container to exist first
    if (config?.container && object.container) {
        const [, groupErr] = await adt.ensureFunctionGroup(requestor, object.container, packageName, transport, state.session.username);
        if (groupErr) return err(groupErr);
    }

    // Step 1: Create the object (form objects are created complete in one POST, unless the type fills them afterwards)
    const [, createErr] = await adt.createObject(requestor, object, packageName, transport, state.session.username);
    if (createErr) return err(createErr);
    if (config?.kind === 'form' && !config.populateAfterCreate) return ok(undefined);

    // Step 2: Populate content via lock → update → unlock (unlocked on every path). If this fails the
    // object exists as an empty shell; the next upsert reads it and updates it.
    const [target, targetErr] = adt.objectLockTarget(object);
    if (targetErr) return err(targetErr);
    return adt.withLock(requestor, target, lockHandle => adt.updateObject(requestor, object, lockHandle, transport));
}
