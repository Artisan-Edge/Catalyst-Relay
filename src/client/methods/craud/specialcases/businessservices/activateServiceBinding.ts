/**
 * Activate service binding method (re-activation, e.g. after its service definition was widened)
 */

import type { AsyncResult } from '../../../../../types/result';
import type { ActivationResult, AdtRequestor } from '../../../../../core/adt';
import type { ClientState } from '../../../../types';
import { err } from '../../../../../types/result';
import * as adt from '../../../../../core/adt';

export async function activateServiceBinding(state: ClientState, requestor: AdtRequestor, bindingName: string): AsyncResult<ActivationResult[]> {
    if (!state.session) return err(new Error('Not logged in'));
    const name = bindingName.trim();
    if (!name) return err(new Error('Service binding name is required'));
    return adt.activateServiceBinding(requestor, name);
}
