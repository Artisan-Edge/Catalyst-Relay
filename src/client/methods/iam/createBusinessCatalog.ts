/**
 * Create business catalog method (orchestration)
 *
 * Sequences create → assign IAM apps → publish locally. Re-running is safe: an existing catalog
 * is reused (it must be in the requested package), apps already assigned are skipped, and the
 * publish runs only when something changed or the catalog is not yet published. A customer EXT
 * app with an empty migrationStatus is migrated before it is assigned; other apps (SAP, IBS,
 * key-user) are never written. When SAP says an assignment name exists, the assignments are
 * re-listed and an app assigned meanwhile is reported as found. The description is set on create
 * only. A failed or pending publish is returned as publishError beside the rest of the result.
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, BusinessCatalogResult, CatalogAppAssignment, CreateBusinessCatalogOptions } from '../../../core/adt';
import type { ClientState } from '../../types';
import { ok, err } from '../../../types/result';
import * as adt from '../../../core/adt';
import { publishOptionsWithin } from './publishWithin';

export async function createBusinessCatalog(
    state: ClientState,
    requestor: AdtRequestor,
    options: CreateBusinessCatalogOptions
): AsyncResult<BusinessCatalogResult> {
    if (!state.session) return err(new Error('Not logged in'));

    const startedAt = Date.now();
    const name = adt.iamName(options.catalogName);
    if (!name) return err(new Error('Business catalog name is required'));
    const result: BusinessCatalogResult = {
        name,
        created: false,
        changed: false,
        descriptionUpdated: false,
        descriptionDiffers: false,
        assignmentsAdded: [],
        assignmentsFound: [],
        appsMigrated: [],
        published: false,
        publishStatus: '',
        steps: { create: 'SKIPPED', assign: 'SKIPPED', publish: 'SKIPPED' },
    };

    // Step 1: Create the catalog unless it exists (an existing one must be in the requested package).
    const [existing, readErr] = await adt.readBusinessCatalog(requestor, name);
    if (readErr) return err(readErr);
    if (existing) {
        const [, packageErr] = adt.requireSamePackage('sia1', name, existing.packageName, options.packageName);
        if (packageErr) return err(packageErr);
        result.descriptionDiffers = existing.description !== adt.iamDescription(options.description || name);
    }

    // Check every app first (a clear message rather than SAP's on a typo'd name).
    const assignments: CatalogAppAssignment[] = [...(existing?.apps ?? [])];
    const assigned = new Set(assignments.map(entry => entry.app.toUpperCase()));
    const missing = [...new Set(options.apps.map(app => adt.iamName(app)).filter(Boolean))].filter(app => !assigned.has(app));
    const toMigrate: string[] = [];
    for (const app of missing) {
        const [appInfo, appErr] = await adt.readIamApp(requestor, app);
        if (appErr) return err(appErr);
        if (!appInfo) return err(new Error(`IAM app ${app} does not exist`));
        if (adt.needsMigration(appInfo)) toMigrate.push(app);
    }

    if (!existing) {
        const [, createErr] = await adt.createBusinessCatalogObject(requestor, name, options.packageName, options.description, options.transport);
        if (createErr) return err(createErr);
        result.created = true;
        result.changed = true;
        result.steps.create = 'DONE';
    }

    // Step 2: Migrate customer EXT apps that need it (SIA7 refuses them otherwise), then assign.
    for (const app of toMigrate) {
        const [saved, migrateErr] = await adt.saveIamAppChanges(requestor, app, { migrationStatus: adt.MIGRATED_STATUS }, options.transport);
        if (migrateErr) return err(migrateErr);
        if (!saved.migrated) continue;
        result.appsMigrated.push(app);
        result.changed = true;
    }
    for (const app of missing) {
        const findExisting = async (): AsyncResult<string | null> => {
            const [listed, listErr] = await adt.readCatalogAssignments(requestor, name);
            if (listErr) return err(listErr);
            return ok(listed.find(entry => entry.app.toUpperCase() === app)?.assignment ?? null);
        };
        const [made, assignErr] = await adt.createNumberedAssignment(name, assignments, candidate =>
            adt.createCatalogAssignment(requestor, name, app, candidate, options.packageName, options.transport), findExisting);
        if (assignErr) return err(assignErr);

        const entry = { assignment: made.assignment, app };
        assignments.push(entry);
        if (!made.created) {
            result.assignmentsFound.push(entry);
            continue;
        }
        result.assignmentsAdded.push(entry);
        result.changed = true;
        result.steps.assign = 'DONE';
    }

    // Step 3: Publish locally — a change, a new catalog, or an unpublished one needs it.
    const isUpToDate = existing?.published === true && missing.length === 0;
    if (options.publish === false || isUpToDate) {
        result.published = isUpToDate;
        result.publishStatus = existing?.publishStatus ?? '';
        return ok(result);
    }

    const [status, publishErr] = await adt.publishBusinessCatalog(requestor, name, publishOptionsWithin(startedAt, options.deadlineMs));
    if (publishErr) {
        result.publishError = publishErr;
        return ok(result);
    }
    result.publishStatus = status;
    result.published = true;
    result.steps.publish = 'DONE';
    return ok(result);
}
