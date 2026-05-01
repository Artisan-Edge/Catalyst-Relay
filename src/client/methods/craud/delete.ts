// Delete objects method — orchestrates multi-delete with dependency analysis.

import type { AsyncResult } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor, DeleteResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function deleteObjects(
    state: ClientState,
    requestor: AdtRequestor,
    objects: ObjectRef[],
    transport?: string
): AsyncResult<DeleteResult[]> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.multiDeleteObjects(requestor, objects, transport);
}
