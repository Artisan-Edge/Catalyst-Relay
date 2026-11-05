/**
 * IAM apps using service bindings method (one scan for several bindings)
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, FindIamAppsUsingBindingsOptions, IamBindingUsageScan } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function findIamAppsUsingBindings(state: ClientState, requestor: AdtRequestor, bindingNames: string[], options?: FindIamAppsUsingBindingsOptions): AsyncResult<IamBindingUsageScan> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.findIamAppsUsingBindings(requestor, bindingNames, options);
}
