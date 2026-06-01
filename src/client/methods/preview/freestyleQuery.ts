/**
 * Freestyle query method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, DataFrame } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function freestyleQuery(
    state: ClientState,
    requestor: AdtRequestor,
    sqlQuery: string,
    limit?: number,
    timeout?: number
): AsyncResult<DataFrame> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.freestyleQuery(requestor, sqlQuery, limit, timeout);
}
