/**
 * Get transports method
 */

import type { AsyncResult } from '../../../../types/result';
import type { AdtRequestor, Transport } from '../../../adt';
import type { ClientState } from '../../types';
import { err } from '../../../../types/result';
import * as adt from '../../../adt';

export async function getTransports(
    state: ClientState,
    requestor: AdtRequestor,
    packageName: string
): AsyncResult<Transport[]> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.getTransports(requestor, packageName);
}
