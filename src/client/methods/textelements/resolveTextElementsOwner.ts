/**
 * Resolve text elements owner method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, TextElementsOwner } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function resolveTextElementsOwner(state: ClientState, requestor: AdtRequestor, name: string): AsyncResult<TextElementsOwner> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.resolveTextElementsOwner(requestor, name);
}
