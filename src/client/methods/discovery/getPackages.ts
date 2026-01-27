/**
 * Get packages method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, Package } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function getPackages(
    state: ClientState,
    requestor: AdtRequestor,
    filter?: string
): AsyncResult<Package[]> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.getPackages(requestor, filter);
}
