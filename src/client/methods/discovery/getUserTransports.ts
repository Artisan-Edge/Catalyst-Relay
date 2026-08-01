/**
 * Get user transports method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, UserTransport, UserTransportFilters } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function getUserTransports(state: ClientState, requestor: AdtRequestor, filters?: UserTransportFilters & { user?: string }): AsyncResult<UserTransport[]> {
    if (!state.session) return err(new Error('Not logged in'));

    const user = filters?.user || state.session.username;
    return adt.getUserTransports(requestor, user, filters);
}
