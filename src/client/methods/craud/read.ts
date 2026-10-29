/**
 * Read objects method
 */

import type { AsyncResult } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { ObjectWithContent, AdtRequestor } from '../../../core/adt';
import type { ClientState } from '../../types';
import { ok, err } from '../../../types/result';
import * as adt from '../../../core/adt';
import { mapLimited } from '../../../core/utils';

export async function read(
    state: ClientState,
    requestor: AdtRequestor,
    objects: ObjectRef[]
): AsyncResult<ObjectWithContent[]> {
    if (!state.session) return err(new Error('Not logged in'));

    const [resolved, resolveErr] = await adt.resolveContainers(requestor, objects);
    if (resolveErr) return err(resolveErr);

    // Fails with the first object, in input order, that could not be read
    return mapLimited(resolved, obj => adt.readObject(requestor, obj));
}
