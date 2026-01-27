/**
 * Git diff method
 */

import type { AsyncResult } from '../../../../types/result';
import type { ObjectContent } from '../../../../types/requests';
import type { AdtRequestor, DiffResult } from '../../../adt';
import type { ClientState } from '../../types';
import { ok, err } from '../../../../types/result';
import * as adt from '../../../adt';

export async function gitDiff(
    state: ClientState,
    requestor: AdtRequestor,
    objects: ObjectContent[]
): AsyncResult<DiffResult[]> {
    if (!state.session) return err(new Error('Not logged in'));
    if (objects.length === 0) return ok([]);

    const results: DiffResult[] = [];
    for (const obj of objects) {
        const [result, diffErr] = await adt.gitDiff(requestor, obj);
        if (diffErr) return err(diffErr);
        results.push(result);
    }
    return ok(results);
}
