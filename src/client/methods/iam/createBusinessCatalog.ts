/**
 * Create business catalog method (orchestration)
 *
 * Sequences create → assign IAM apps → publish locally. Re-running is safe: an
 * existing catalog is reused, apps already assigned are skipped, and the publish
 * runs only when something changed or the catalog is not yet published.
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, BusinessCatalogResult, CatalogAppAssignment, CreateBusinessCatalogOptions } from '../../../core/adt';
import type { ClientState } from '../../types';
import { ok, err } from '../../../types/result';
import * as adt from '../../../core/adt';

const PUBLISHED_STATUS = 'p';

export async function createBusinessCatalog(
    state: ClientState,
    requestor: AdtRequestor,
    options: CreateBusinessCatalogOptions
): AsyncResult<BusinessCatalogResult> {
    if (!state.session) return err(new Error('Not logged in'));

    const name = options.catalogName.toUpperCase();
    const result: BusinessCatalogResult = {
        name,
        created: false,
        assignmentsAdded: [],
        published: false,
        publishStatus: '',
        steps: { create: 'SKIPPED', assign: 'SKIPPED', publish: 'SKIPPED' },
    };

    // Step 1: Create the catalog unless it exists.
    const [existing, readErr] = await adt.readBusinessCatalog(requestor, name);
    if (readErr) return err(readErr);
    if (!existing) {
        const [, createErr] = await adt.createBusinessCatalogObject(requestor, name, options.packageName, options.description, options.transport);
        if (createErr) return err(createErr);
        result.created = true;
        result.steps.create = 'DONE';
    }

    // Step 2: Assign the apps that are not in the catalog yet.
    const assignments: CatalogAppAssignment[] = [...(existing?.apps ?? [])];
    const assigned = new Set(assignments.map(entry => entry.app.toUpperCase()));
    const missing = [...new Set(options.apps.map(app => app.toUpperCase()))].filter(app => !assigned.has(app));
    for (const app of missing) {
        // Fail early with a clear message rather than SAP's on a typo'd app name.
        const [appInfo, appErr] = await adt.readIamApp(requestor, app);
        if (appErr) return err(appErr);
        if (!appInfo) return err(new Error(`IAM app ${app} does not exist`));

        const assignment = adt.nextAssignmentName(name, assignments);
        const [, assignErr] = await adt.createCatalogAssignment(requestor, name, app, assignment, options.packageName, options.transport);
        if (assignErr) return err(assignErr);

        const entry = { assignment, app };
        assignments.push(entry);
        result.assignmentsAdded.push(entry);
        result.steps.assign = 'DONE';
    }

    // Step 3: Publish locally — a change, a new catalog, or an unpublished one needs it.
    const isUpToDate = existing?.published === true && missing.length === 0;
    if (options.publish === false || isUpToDate) {
        result.published = isUpToDate;
        result.publishStatus = existing?.publishStatus ?? '';
        return ok(result);
    }

    const [status, publishErr] = await adt.publishBusinessCatalog(requestor, name);
    if (publishErr) return err(publishErr);
    result.publishStatus = status;
    result.published = status === PUBLISHED_STATUS;
    result.steps.publish = 'DONE';
    return ok(result);
}
