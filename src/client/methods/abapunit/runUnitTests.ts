/**
 * Run ABAP Unit tests method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, UnitTestRunOptions, UnitTestRunResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function runUnitTests(state: ClientState, requestor: AdtRequestor, options: UnitTestRunOptions): AsyncResult<UnitTestRunResult> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.runUnitTests(requestor, options);
}
