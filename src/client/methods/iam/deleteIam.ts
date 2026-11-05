/**
 * Delete IAM object method
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, IamObjectKind } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function deleteIamObject(state: ClientState, requestor: AdtRequestor, kind: IamObjectKind, name: string, transport?: string): AsyncResult<void> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.deleteIamObject(requestor, kind, name, transport);
}
