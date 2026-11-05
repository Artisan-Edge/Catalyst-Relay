/**
 * Read text elements method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, TextElementsOwner, TextElementsPart, TextElementsParts } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function readTextElements(state: ClientState, requestor: AdtRequestor, owner: TextElementsOwner, parts?: readonly TextElementsPart[]): AsyncResult<TextElementsParts> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.readTextElements(requestor, owner, parts);
}
