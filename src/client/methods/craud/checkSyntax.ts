// Syntax check method

import type { AsyncResult } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor, CheckResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function checkSyntax(
    state: ClientState,
    requestor: AdtRequestor,
    objects: ObjectRef[]
): AsyncResult<CheckResult[]> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.checkSyntax(requestor, objects);
}
