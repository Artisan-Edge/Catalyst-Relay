/**
 * Get function group parts method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, FunctionGroupParts } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function getFunctionGroupParts(state: ClientState, requestor: AdtRequestor, group: string): AsyncResult<FunctionGroupParts> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.getFunctionGroupParts(requestor, group);
}
