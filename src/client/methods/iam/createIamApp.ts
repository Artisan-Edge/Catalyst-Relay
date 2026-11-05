/**
 * Create IAM app method (orchestration)
 *
 * Sequences create → one full-document save (new services, UI5 app ID, migration) → publish
 * locally. Re-running is safe: an existing app is reused, listed services and an equal UI5 app ID
 * are skipped (an IWSV row matches by name and version), and migrationStatus is only set
 * where its element is empty. The publish always runs (unless
 * disabled): publishStatus reads 'p' even before the first publish, so nothing tells whether one
 * is needed. The publish call waits until SAP reports the app published.
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, CreateIamAppOptions, IamAppChanges, IamAppInfo, IamAppResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { ok, err } from '../../../types/result';
import * as adt from '../../../core/adt';

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
        ui5AppId: '',
        migrated: false,
        published: false,
        publishStatus: '',
        steps: { create: 'SKIPPED', services: 'SKIPPED', ui5AppId: 'SKIPPED', migration: 'SKIPPED', publish: 'SKIPPED' },
    };

    // Step 1: Create the app unless it exists.
    const [existing, readErr] = await adt.readIamApp(requestor, name);
    if (readErr) return err(readErr);
    if (existing && options.appType && existing.appType !== options.appType.toUpperCase()) {
        return err(new Error(`IAM app ${name} already exists with application type ${existing.appType}`));
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
        result.steps.create = 'DONE';
    }
    result.ui5AppId = app.ui5AppId;

    // Step 2: Save what differs in one locked PUT.
    const missing = options.services.filter(service => !adt.isServiceListed(app.services, service));
    const wantedUi5AppId = options.ui5AppId?.trim().toUpperCase();
    const changes: IamAppChanges = {};

    if (missing.length > 0) {
        const [details, resolveErr] = await adt.resolveIamServices(requestor, name, missing);
        if (resolveErr) return err(resolveErr);
        changes.services = details;
    }
    if (wantedUi5AppId && wantedUi5AppId !== app.ui5AppId.toUpperCase()) changes.ui5AppId = wantedUi5AppId;
    if (adt.needsMigration(app)) changes.migrationStatus = adt.MIGRATED_STATUS;

    if (Object.keys(changes).length > 0) {
        const [, saveErr] = await adt.saveIamAppChanges(requestor, name, changes, options.transport);
        if (saveErr) return err(saveErr);
    }
    if (changes.services) {
        result.servicesAdded = missing.map(service => service.name.toUpperCase());
        result.steps.services = 'DONE';
    }
    if (changes.ui5AppId) {
        result.ui5AppId = changes.ui5AppId;
        result.steps.ui5AppId = 'DONE';
    }
    if (changes.migrationStatus) {
        result.migrated = true;
        result.steps.migration = 'DONE';
    }

    // Step 3: Publish locally and wait for it.
    if (options.publish === false) return ok(result);

    const [status, publishErr] = await adt.publishIamApp(requestor, name);
    if (publishErr) return err(publishErr);
    result.publishStatus = status;
    result.published = true;
    result.steps.publish = 'DONE';
    return ok(result);
}
