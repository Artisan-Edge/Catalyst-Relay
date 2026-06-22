/**
 * Get API release state method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, ApiReleaseState } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function getApiReleaseState(
    state: ClientState,
    requestor: AdtRequestor,
    objectName: string
): AsyncResult<ApiReleaseState> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.getApiReleaseState(requestor, objectName);
}
