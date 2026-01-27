/**
 * Activate objects method
 */

import type { AsyncResult } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor, ActivationResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function activate(
    state: ClientState,
    requestor: AdtRequestor,
    objects: ObjectRef[]
): AsyncResult<ActivationResult[]> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.activateObjects(requestor, objects);
}
