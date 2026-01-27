/**
 * Get distinct values method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, DistinctResult, Parameter } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function getDistinctValues(
    state: ClientState,
    requestor: AdtRequestor,
    objectName: string,
    parameters: Parameter[],
    column: string,
    objectType: 'table' | 'view' = 'view'
): AsyncResult<DistinctResult> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.getDistinctValues(requestor, objectName, parameters, column, objectType);
}
