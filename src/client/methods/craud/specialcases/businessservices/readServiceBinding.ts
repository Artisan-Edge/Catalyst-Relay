/**
 * Read service binding method
 */

import type { AsyncResult } from '../../../../../types/result';
import type { AdtRequestor, ServiceBindingInfo } from '../../../../../core/adt';
import type { ClientState } from '../../../../types';
import { ok, err } from '../../../../../types/result';
import * as adt from '../../../../../core/adt';

export async function readServiceBinding(
    state: ClientState,
    requestor: AdtRequestor,
    bindingName: string
): AsyncResult<ServiceBindingInfo> {
    if (!state.session) return err(new Error('Not logged in'));

    const [binding, readErr] = await adt.readServiceBinding(requestor, bindingName);
    if (readErr) return err(readErr);
    if (!binding) return err(new Error(`Service binding ${bindingName.toUpperCase()} does not exist`));
    return ok(binding);
}
