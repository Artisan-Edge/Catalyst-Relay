/**
 * Release API method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, ApiReleaseResult, ApiReleaseVisibility } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function releaseApi(
    state: ClientState,
    requestor: AdtRequestor,
    objectName: string,
    transport?: string,
    visibility?: ApiReleaseVisibility
): AsyncResult<ApiReleaseResult> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.releaseApi(requestor, objectName, transport, visibility);
}
