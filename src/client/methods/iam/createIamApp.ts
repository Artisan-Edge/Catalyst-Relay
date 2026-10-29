/**
 * Create IAM app method (orchestration)
 *
 * Sequences create → add services → publish locally. Re-running is safe: an
 * existing app is reused and services already listed are skipped. The publish
 * always runs (unless disabled): an app's publishStatus reads 'p' even before
 * its first publish, so it cannot tell whether one is needed.
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, CreateIamAppOptions, IamAppResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { ok, err } from '../../../types/result';
import * as adt from '../../../core/adt';

const PUBLISHED_STATUS = 'p';

export async function createIamApp(
    state: ClientState,
    requestor: AdtRequestor,
    options: CreateIamAppOptions
): AsyncResult<IamAppResult> {
    if (!state.session) return err(new Error('Not logged in'));

    const name = options.appName.toUpperCase();
    const result: IamAppResult = {
        name,
        created: false,
        servicesAdded: [],
        published: false,
        publishStatus: '',
        steps: { create: 'SKIPPED', services: 'SKIPPED', publish: 'SKIPPED' },
    };

    // Step 1: Create the app unless it exists.
    const [existing, readErr] = await adt.readIamApp(requestor, name);
    if (readErr) return err(readErr);
    if (existing && options.appType && existing.appType !== options.appType.toUpperCase()) {
        return err(new Error(`IAM app ${name} already exists with application type ${existing.appType}`));
    }
    if (!existing) {
        const [, createErr] = await adt.createIamAppObject(requestor, name, options.packageName, options.description, options.appType, options.transport);
        if (createErr) return err(createErr);
        result.created = true;
        result.steps.create = 'DONE';
    }

    // Step 2: Add the services the app does not list yet.
    const listed = new Set((existing?.services ?? []).map(service => `${service.type}:${service.name.toUpperCase()}`));
    const missing = options.services.filter(service => !listed.has(`${service.type}:${service.name.toUpperCase()}`));
    if (missing.length > 0) {
        const [, servicesErr] = await adt.addIamAppServices(requestor, name, missing, options.transport);
        if (servicesErr) return err(servicesErr);
        result.servicesAdded = missing.map(service => service.name.toUpperCase());
        result.steps.services = 'DONE';
    }

    // Step 3: Publish locally.
    if (options.publish === false) return ok(result);

    const [status, publishErr] = await adt.publishIamApp(requestor, name);
    if (publishErr) return err(publishErr);
    result.publishStatus = status;
    result.published = status === PUBLISHED_STATUS;
    result.steps.publish = 'DONE';
    return ok(result);
}
