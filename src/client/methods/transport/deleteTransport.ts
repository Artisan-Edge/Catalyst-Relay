/**
 * Delete transport method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function deleteTransport(
    state: ClientState,
    requestor: AdtRequestor,
    transportId: string,
    removeObjects = false
): AsyncResult<void> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.deleteTransport(requestor, transportId, removeObjects);
}
