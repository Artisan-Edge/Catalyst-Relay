/**
 * Write class include method (lock → write include → unlock)
 */

import type { AsyncResult } from '../../../../../types/result';
import type { ObjectRef } from '../../../../../types/requests';
import type { AdtRequestor, ClassIncludeType } from '../../../../../core/adt';
import type { ClientState } from '../../../../types';
import { ok, err } from '../../../../../types/result';
import * as adt from '../../../../../core/adt';

export async function writeClassInclude(
    state: ClientState,
    requestor: AdtRequestor,
    className: string,
    includeType: ClassIncludeType,
    source: string,
    transport?: string
): AsyncResult<void> {
    if (!state.session) return err(new Error('Not logged in'));

    // The lock is on the class as a whole; the include shares that handle.
    const objRef: ObjectRef = { name: className, extension: 'aclass' };

    // Lock the class before writing the include.
    const [lockHandle, lockErr] = await adt.lockObject(requestor, objRef);
    if (lockErr) return err(lockErr);

    // Write the include source.
    const [, updateErr] = await adt.updateClassInclude(requestor, className, includeType, source, lockHandle, transport);

    // Always unlock after the write attempt.
    const [, unlockErr] = await adt.unlockObject(requestor, objRef, lockHandle);

    // Return first error encountered.
    if (updateErr) return err(updateErr);
    if (unlockErr) return err(unlockErr);

    return ok(undefined);
}
