/**
 * Create transport method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, TransportConfig } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function createTransport(
    state: ClientState,
    requestor: AdtRequestor,
    transportConfig: TransportConfig
): AsyncResult<string> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.createTransport(requestor, transportConfig);
}
