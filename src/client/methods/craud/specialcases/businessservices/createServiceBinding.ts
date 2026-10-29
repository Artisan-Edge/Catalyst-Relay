/**
 * Create service binding method (orchestration)
 *
 * Sequences the full lifecycle: validate → create → activate → publish.
 * Re-running on an existing binding is safe: steps whose outcome is already in
 * place report SKIPPED, so only what is missing (activation, publish) runs.
 */

import type { AsyncResult } from '../../../../../types/result';
import type { AdtRequestor, CreateServiceBindingOptions, ServiceBindingInfo, ServiceBindingResult } from '../../../../../core/adt';
import type { ClientState } from '../../../../types';
import { ok, err } from '../../../../../types/result';
import * as adt from '../../../../../core/adt';

export async function createServiceBinding(
    state: ClientState,
    requestor: AdtRequestor,
    options: CreateServiceBindingOptions
): AsyncResult<ServiceBindingResult> {
    if (!state.session) return err(new Error('Not logged in'));

    const bindingName = options.bindingName.toUpperCase();
    const bindingVersion = options.bindingVersion ?? 'V4';
    const result: ServiceBindingResult = {
        name: bindingName,
        serviceDefinition: options.serviceDefinition.toUpperCase(),
        category: options.bindingCategory ?? 'WEB_API',
        created: false,
        activation: [],
        published: false,
        steps: { validate: 'SKIPPED', create: 'SKIPPED', activate: 'SKIPPED', publish: 'SKIPPED' },
        notes: [],
    };

    // Step 0: An existing binding skips validate + create, but must match what was asked for.
    const [existing, readErr] = await adt.readServiceBinding(requestor, bindingName);
    if (readErr) return err(readErr);
    if (existing) {
        const mismatch = describeMismatch(existing, result, bindingVersion);
        if (mismatch) return err(new Error(`Service binding ${bindingName} already exists with ${mismatch}; delete it first or choose another name`));
    }

    if (!existing) {
        // Step 1: Validate (abort on ERROR, or WARNING unless allowed).
        const [notes, validateErr] = await adt.validateServiceBinding(requestor, options);
        if (validateErr) return err(validateErr);
        result.notes.push(...notes);
        result.steps.validate = 'DONE';

        // Step 2: Create the binding shell.
        const [, createErr] = await adt.createServiceBindingObject(requestor, options, state.session.username);
        if (createErr) return err(createErr);
        result.created = true;
        result.steps.create = 'DONE';
    }

    // Step 3: Activate, unless the binding already reads back active.
    if (!existing?.active) {
        const [activation, activateErr] = await adt.activateServiceBinding(requestor, bindingName);
        if (activateErr) return err(activateErr);
        result.activation = activation;
        result.steps.activate = 'DONE';

        // Don't publish a binding that failed activation.
        if (activation.some(entry => entry.status === 'error')) {
            return err(new Error(`Service binding ${bindingName} failed activation`));
        }
    }

    // Step 4: Publish (unless disabled or already published).
    if (existing?.published) {
        result.published = true;
        return ok(result);
    }
    if (options.publish === false) return ok(result);

    const [publishMessage, publishErr] = await adt.publishServiceBinding(requestor, bindingName, bindingVersion);
    if (publishErr) return resolvePublishFailure(requestor, result, publishErr);

    result.published = true;
    result.steps.publish = 'DONE';
    if (publishMessage) result.publishMessage = publishMessage;
    return ok(result);
}

// The binding that exists must be the one requested; anything else would be silently reported as done.
function describeMismatch(existing: ServiceBindingInfo, requested: ServiceBindingResult, bindingVersion: string): string | null {
    if (existing.serviceDefinition.toUpperCase() !== requested.serviceDefinition) return `service definition ${existing.serviceDefinition}`;
    if (existing.category !== requested.category) return `category ${existing.category}`;
    if (existing.odataVersion.toUpperCase() !== bindingVersion) return `OData version ${existing.odataVersion}`;
    return null;
}

// A failed publish request (most often a timeout on public cloud) does not mean the publish failed:
// read the binding back and report its real state.
async function resolvePublishFailure(
    requestor: AdtRequestor,
    result: ServiceBindingResult,
    publishErr: Error
): AsyncResult<ServiceBindingResult> {
    const [binding, readErr] = await adt.readServiceBinding(requestor, result.name);
    if (readErr || !binding) {
        return err(new Error(`${publishErr.message} (publish state of ${result.name} could not be read back; re-run to publish if it is not published)`));
    }
    if (!binding.published) {
        return err(new Error(`${publishErr.message} (${result.name} exists and is active but is NOT published; re-run binding create to publish it)`));
    }

    result.published = true;
    result.steps.publish = 'DONE';
    result.notes.push(`The publish request failed (${publishErr.message}), but ${result.name} reads back as published`);
    return ok(result);
}
