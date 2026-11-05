/**
 * Activate text elements method
 */

import type { AsyncResult } from '../../../types/result';
import type { ActivationResult, AdtRequestor, TextElementsOwner } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function activateTextElements(state: ClientState, requestor: AdtRequestor, owners: readonly TextElementsOwner[]): AsyncResult<ActivationResult[]> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.activateTextElements(requestor, owners);
}
