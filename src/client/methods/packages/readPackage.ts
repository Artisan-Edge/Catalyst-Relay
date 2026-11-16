/**
 * Read package method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, PackageSettings } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function readPackage(
    state: ClientState,
    requestor: AdtRequestor,
    packageName: string
): AsyncResult<PackageSettings | null> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.readPackageSettings(requestor, packageName);
}
