/**
 * Get inactive objects method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, InactiveEntry } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function getInactiveObjects(
    state: ClientState,
    requestor: AdtRequestor
): AsyncResult<InactiveEntry[]> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.getInactiveObjects(requestor);
}
