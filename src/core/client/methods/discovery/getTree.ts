/**
 * Get tree method
 */

import type { AsyncResult } from '../../../../types/result';
import type { TreeQuery } from '../../../../types/requests';
import type { AdtRequestor, TreeResponse } from '../../../adt';
import type { ClientState } from '../../types';
import { err } from '../../../../types/result';
import * as adt from '../../../adt';

export async function getTree(
    state: ClientState,
    requestor: AdtRequestor,
    query: TreeQuery
): AsyncResult<TreeResponse> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.getTree(requestor, query);
}
