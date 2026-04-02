/**
 * Search objects method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, SearchResult, SearchOptions } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function search(
    state: ClientState,
    requestor: AdtRequestor,
    query: string,
    options?: SearchOptions
): AsyncResult<SearchResult[]> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.searchObjects(requestor, query, options);
}
