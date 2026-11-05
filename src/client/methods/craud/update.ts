/**
 * Update object method
 */

import type { AsyncResult } from '../../../types/result';
import type { ObjectContent } from '../../../types/requests';
import type { AdtRequestor } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function update(
    state: ClientState,
    requestor: AdtRequestor,
    object: ObjectContent,
    transport?: string
): AsyncResult<void> {
    if (!state.session) return err(new Error('Not logged in'));
    const [, sourceErr] = adt.refuseInvalidAffSource(object);
    if (sourceErr) return err(sourceErr);

    // Lock → update → unlock (unlocked on every path)
    const [target, targetErr] = adt.objectLockTarget(object);
    if (targetErr) return err(targetErr);
    return adt.withLock(requestor, target, lockHandle => adt.updateObject(requestor, object, lockHandle, transport));
}
