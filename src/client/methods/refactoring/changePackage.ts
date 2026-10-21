/**
 * Change package method
 */

import type { AsyncResult } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor, ChangePackageOptions, ChangePackageResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function changePackage(
    state: ClientState,
    requestor: AdtRequestor,
    objects: ObjectRef[],
    targetPackage: string,
    options?: ChangePackageOptions
): AsyncResult<ChangePackageResult[]> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.changePackage(requestor, objects, targetPackage, options);
}
