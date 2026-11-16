/**
 * Object exists method
 */

import type { AsyncResult } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function objectExists(
    state: ClientState,
    requestor: AdtRequestor,
    object: ObjectRef
): AsyncResult<boolean> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.objectExists(requestor, object);
}
