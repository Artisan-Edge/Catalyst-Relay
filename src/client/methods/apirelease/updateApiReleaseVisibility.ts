/**
 * Update API release visibility method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, ApiReleaseVisibility, ApiReleaseVisibilityOptions, ApiReleaseVisibilityResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function updateApiReleaseVisibility(
    state: ClientState,
    requestor: AdtRequestor,
    objectName: string,
    change: Partial<ApiReleaseVisibility>,
    options?: ApiReleaseVisibilityOptions
): AsyncResult<ApiReleaseVisibilityResult> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.updateApiReleaseVisibility(requestor, objectName, change, options);
}
