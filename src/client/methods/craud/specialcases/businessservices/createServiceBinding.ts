/**
 * Create service binding method (orchestration)
 *
 * Sequences the full lifecycle: validate → create → activate → publish.
 */

import type { AsyncResult } from '../../../../../types/result';
import type { AdtRequestor, CreateServiceBindingOptions, ServiceBindingResult } from '../../../../../core/adt';
import type { ClientState } from '../../../../types';
import { ok, err } from '../../../../../types/result';
import * as adt from '../../../../../core/adt';

export async function createServiceBinding(
    state: ClientState,
    requestor: AdtRequestor,
    options: CreateServiceBindingOptions
): AsyncResult<ServiceBindingResult> {
    if (!state.session) return err(new Error('Not logged in'));

    // Step 1: Validate (abort on non-OK severity).
    const [, validateErr] = await adt.validateServiceBinding(requestor, options);
    if (validateErr) return err(validateErr);

    // Step 2: Create the binding shell.
    const [, createErr] = await adt.createServiceBindingObject(requestor, options, state.session.username);
    if (createErr) return err(createErr);

    // Step 3: Activate.
    const [activation, activateErr] = await adt.activateServiceBinding(requestor, options.bindingName);
    if (activateErr) return err(activateErr);

    // Don't publish a binding that failed activation.
    if (activation.some(result => result.status === 'error')) {
        return err(new Error(`Service binding ${options.bindingName} failed activation`));
    }

    const result: ServiceBindingResult = {
        name: options.bindingName.toUpperCase(),
        serviceDefinition: options.serviceDefinition.toUpperCase(),
        created: true,
        activation,
        published: false,
    };

    // Step 4: Publish (unless explicitly disabled).
    if (options.publish === false) {
        return ok(result);
    }

    const [publishMessage, publishErr] = await adt.publishServiceBinding(requestor, options.bindingName);
    if (publishErr) return err(publishErr);

    result.published = true;
    if (publishMessage) result.publishMessage = publishMessage;
    return ok(result);
}
