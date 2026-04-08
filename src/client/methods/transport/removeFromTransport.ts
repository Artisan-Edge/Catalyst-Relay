/**
 * Remove object from transport method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function removeFromTransport(
    state: ClientState,
    requestor: AdtRequestor,
    transportId: string,
    objectName: string
): AsyncResult<void> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.removeFromTransport(requestor, transportId, objectName);
}
