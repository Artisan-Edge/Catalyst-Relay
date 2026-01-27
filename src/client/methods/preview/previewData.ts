/**
 * Preview data method
 */

import type { AsyncResult } from '../../../types/result';
import type { PreviewSQL } from '../../../types/requests';
import type { AdtRequestor, DataFrame } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function previewData(
    state: ClientState,
    requestor: AdtRequestor,
    query: PreviewSQL
): AsyncResult<DataFrame> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.previewData(requestor, query);
}
