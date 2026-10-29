/**
 * Create package method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, CreatePackageOptions, CreatePackageResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function createPackage(
    state: ClientState,
    requestor: AdtRequestor,
    options: CreatePackageOptions
): AsyncResult<CreatePackageResult> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.createPackage(requestor, options, state.session.username);
}
