/**
 * Run ATC method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, AtcRunOptions, AtcRunResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function runAtc(state: ClientState, requestor: AdtRequestor, options: AtcRunOptions): AsyncResult<AtcRunResult> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.runAtc(requestor, options);
}
