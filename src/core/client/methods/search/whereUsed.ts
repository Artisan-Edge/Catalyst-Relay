/**
 * Where-used analysis method
 */

import type { AsyncResult } from '../../../../types/result';
import type { ObjectRef } from '../../../../types/requests';
import type { AdtRequestor, Dependency } from '../../../adt';
import type { ClientState } from '../../types';
import { err } from '../../../../types/result';
import * as adt from '../../../adt';

export async function whereUsed(
    state: ClientState,
    requestor: AdtRequestor,
    object: ObjectRef
): AsyncResult<Dependency[]> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.findWhereUsed(requestor, object);
}
