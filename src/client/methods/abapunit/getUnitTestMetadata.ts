/**
 * ABAP Unit client setup method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, UnitTestMetadata } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function getUnitTestMetadata(state: ClientState, requestor: AdtRequestor): AsyncResult<UnitTestMetadata> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.getUnitTestMetadata(requestor);
}
