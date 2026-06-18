/**
 * Delete service binding method
 */

import type { AsyncResult } from '../../../../../types/result';
import type { AdtRequestor } from '../../../../../core/adt';
import type { ClientState } from '../../../../types';
import { err } from '../../../../../types/result';
import * as adt from '../../../../../core/adt';

export async function deleteServiceBinding(
    state: ClientState,
    requestor: AdtRequestor,
    bindingName: string,
    transport?: string
): AsyncResult<void> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.deleteServiceBinding(requestor, bindingName, transport);
}
