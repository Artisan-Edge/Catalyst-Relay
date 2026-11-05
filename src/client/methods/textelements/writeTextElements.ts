/**
 * Write text elements method (parts stay inactive until activateTextElements)
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, TextElementsOwner, TextElementsParts, TextElementsWriteResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function writeTextElements(state: ClientState, requestor: AdtRequestor, owner: TextElementsOwner, parts: TextElementsParts, transport?: string): AsyncResult<TextElementsWriteResult> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.writeTextElements(requestor, owner, parts, transport);
}
