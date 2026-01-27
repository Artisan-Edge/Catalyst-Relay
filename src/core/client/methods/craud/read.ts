/**
 * Read objects method
 */

import type { AsyncResult } from '../../../../types/result';
import type { ObjectRef } from '../../../../types/requests';
import type { ObjectWithContent, AdtRequestor } from '../../../adt';
import type { ClientState } from '../../types';
import { ok, err } from '../../../../types/result';
import * as adt from '../../../adt';

export async function read(
    state: ClientState,
    requestor: AdtRequestor,
    objects: ObjectRef[]
): AsyncResult<ObjectWithContent[]> {
    if (!state.session) return err(new Error('Not logged in'));

    const results: ObjectWithContent[] = [];
    for (const obj of objects) {
        const [result, readErr] = await adt.readObject(requestor, obj);
        if (readErr) return err(readErr);
        results.push(result);
    }
    return ok(results);
}
