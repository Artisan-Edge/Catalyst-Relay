/**
 * Create IAM app method (orchestration)
 *
 * Sequences create → one full-document save (new services, UI5 app ID, migration) → publish
 * locally. Re-running is safe: an existing app is reused (it must be in the requested package),
 * listed services and an equal UI5 app ID are skipped (re-checked under the lock), and
 * migrationStatus is only set on a customer EXT app whose element is empty. The description is
 * set on create only. The publish always runs (unless disabled): publishStatus reads 'p' even
 * before the first publish. A failed or pending publish is returned as publishError beside the
 * rest of the result.
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, CreateIamAppOptions, IamAppChanges, IamAppInfo, IamAppResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { ok, err } from '../../../types/result';
import * as adt from '../../../core/adt';
import { publishOptionsWithin } from './publishWithin';

export async function createIamApp(
    state: ClientState,
    requestor: AdtRequestor,
    options: CreateIamAppOptions
): AsyncResult<IamAppResult> {
    if (!state.session) return err(new Error('Not logged in'));

    const startedAt = Date.now();
    const name = adt.iamName(options.appName);
    if (!name) return err(new Error('IAM app name is required'));
    const result: IamAppResult = {
        name,
        created: false,
        changed: false,
        descriptionUpdated: false,
        descriptionDiffers: false,
        servicesAdded: [],
        ui5AppId: '',
        ui5AppIdReplaced: null,
        migrated: false,
        published: false,
        publishStatus: '',
        steps: { create: 'SKIPPED', services: 'SKIPPED', ui5AppId: 'SKIPPED', migration: 'SKIPPED', publish: 'SKIPPED' },
    };

    // Step 1: Create the app unless it exists (an existing one must be in the requested package and of the requested type).
    const [existing, readErr] = await adt.readIamApp(requestor, name);
    if (readErr) return err(readErr);
    if (existing) {
        const [, packageErr] = adt.requireSamePackage('sia6', name, existing.packageName, options.packageName);
        if (packageErr) return err(packageErr);
        if (options.appType && existing.appType !== adt.iamName(options.appType)) {
            return err(new Error(`IAM app ${name} already exists with application type ${existing.appType}`));
        }
        result.descriptionDiffers = existing.description !== adt.iamDescription(options.description || name);
    }
    let app: IamAppInfo;
    if (existing) {
        app = existing;
    } else {
        const [created, createErr] = await adt.createIamAppObject(requestor, name, options.packageName, options.description, options.appType, options.transport);
        if (createErr) return err(createErr);
        // The create response shows migrationStatus empty even when a read shows 3; trust the read.
        const [reread, rereadErr] = await adt.readIamApp(requestor, name);
        if (rereadErr) return err(rereadErr);
        app = reread ?? created;
        result.created = true;
        result.changed = true;
        result.steps.create = 'DONE';
    }
    result.ui5AppId = app.ui5AppId;

    // Step 2: Save what differs in one locked PUT (re-checked against the document read under the lock).
    const missing = options.services.filter(service => !adt.isServiceListed(app.services, service));
    const wantedUi5AppId = options.ui5AppId ? adt.iamName(options.ui5AppId) : '';
    const changes: IamAppChanges = {};

    if (missing.length > 0) {
        const [details, resolveErr] = await adt.resolveIamServices(requestor, name, missing);
        if (resolveErr) return err(resolveErr);
        changes.services = details;
    }
    if (wantedUi5AppId && wantedUi5AppId !== app.ui5AppId.toUpperCase()) changes.ui5AppId = wantedUi5AppId;
    if (adt.needsMigration(app)) changes.migrationStatus = adt.MIGRATED_STATUS;

    if (Object.keys(changes).length > 0) {
        const [saved, saveErr] = await adt.saveIamAppChanges(requestor, name, changes, options.transport);
        if (saveErr) return err(saveErr);
        if (saved.services.length > 0) {
            result.servicesAdded = saved.services.map(row => adt.serviceRefOf(row).name);
            result.steps.services = 'DONE';
        }
        // Wanted ID in place, whether this save wrote it or another session did meanwhile
        if (changes.ui5AppId) result.ui5AppId = changes.ui5AppId;
        if (saved.previousUi5AppId !== null) {
            result.ui5AppIdReplaced = saved.previousUi5AppId || null;
            result.steps.ui5AppId = 'DONE';
        }
        if (saved.migrated) {
            result.migrated = true;
            result.steps.migration = 'DONE';
        }
        result.changed ||= saved.saved;
    }

    // Step 3: Publish locally and wait for it; a failure is reported beside the result, not instead of it.
    if (options.publish === false) return ok(result);

    const [status, publishErr] = await adt.publishIamApp(requestor, name, publishOptionsWithin(startedAt, options.deadlineMs));
    if (publishErr) {
        result.publishError = publishErr;
        return ok(result);
    }
    result.publishStatus = status;
    result.published = true;
    result.steps.publish = 'DONE';
    return ok(result);
}
