/**
 * Client logout method
 */

import type { AsyncResult } from '../../../types/result';
import type { ClientContext } from '../../types';
import * as sessionOps from '../../../core/session';

export async function logout(ctx: ClientContext): AsyncResult<void> {
    ctx.stopAutoRefresh();
    return sessionOps.logout(ctx.state, ctx.request);
}
