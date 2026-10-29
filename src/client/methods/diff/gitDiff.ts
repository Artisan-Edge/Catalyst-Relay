/**
 * Git diff method
 */

import type { AsyncResult } from '../../../types/result';
import type { ObjectContent } from '../../../types/requests';
import type { AdtRequestor, DiffResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { ok, err } from '../../../types/result';
import * as adt from '../../../core/adt';
import { mapLimited } from '../../../core/utils';

export async function gitDiff(
    state: ClientState,
    requestor: AdtRequestor,
    objects: ObjectContent[]
): AsyncResult<DiffResult[]> {
    if (!state.session) return err(new Error('Not logged in'));
    if (objects.length === 0) return ok([]);

    const [resolved, resolveErr] = await adt.resolveContainers(requestor, objects);
    if (resolveErr) return err(resolveErr);

    // Fails with the first object, in input order, that could not be diffed
    return mapLimited(resolved, obj => adt.gitDiff(requestor, obj));
}
