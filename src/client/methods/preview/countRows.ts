/**
 * Count rows method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function countRows(
    state: ClientState,
    requestor: AdtRequestor,
    objectName: string,
    objectType: 'table' | 'view'
): AsyncResult<number> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.countRows(requestor, objectName, objectType);
}
