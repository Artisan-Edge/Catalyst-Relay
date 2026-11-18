/**
 * Get transport targets method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, TransportTarget } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function getTransportTargets(
    state: ClientState,
    requestor: AdtRequestor
): AsyncResult<TransportTarget[]> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.getTransportTargets(requestor);
}
