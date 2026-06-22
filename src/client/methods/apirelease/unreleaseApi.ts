/**
 * Unrelease API method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, ApiReleaseResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function unreleaseApi(
    state: ClientState,
    requestor: AdtRequestor,
    objectName: string,
    transport?: string
): AsyncResult<ApiReleaseResult> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.unreleaseApi(requestor, objectName, transport);
}
