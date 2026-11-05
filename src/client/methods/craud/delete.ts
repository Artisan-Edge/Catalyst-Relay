// Delete objects method — orchestrates multi-delete with dependency analysis.

import type { AsyncResult } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor, DeleteResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { ok, err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function deleteObjects(
    state: ClientState,
    requestor: AdtRequestor,
    objects: ObjectRef[],
    transport?: string
): AsyncResult<DeleteResult[]> {
    if (!state.session) return err(new Error('Not logged in'));
    const [resolved, resolveErr] = await adt.resolveContainers(requestor, objects);
    if (resolveErr) return err(resolveErr);

    // Includes and function modules of a group deleted in the same call go with the group.
    const { direct, parts } = adt.splitGroupParts(resolved);
    const [results, deleteErr] = await adt.multiDeleteObjects(requestor, direct, transport);
    if (deleteErr) return err(deleteErr);
    return ok([...results, ...adt.rollUpGroupParts(parts, results)]);
}
