/**
 * Client session refresh method
 */

import type { AsyncResult } from '../../../../types/result';
import type { ClientContext } from '../../types';
import type { RefreshResult } from '../../../session/refresh';
import { err } from '../../../../types/result';
import * as sessionOps from '../../../session';

export async function refreshSession(ctx: ClientContext): AsyncResult<RefreshResult> {
    if (!ctx.state.session) {
        return err(new Error('Not logged in'));
    }
    return sessionOps.refreshSession(ctx.state, ctx.request);
}
