/**
 * View transport objects method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor } from '../../../core/adt';
import type { TaskContents } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function viewTransportObjects(
    state: ClientState,
    requestor: AdtRequestor,
    transportId: string
): AsyncResult<TaskContents[]> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.viewTransportObjects(requestor, transportId);
}
