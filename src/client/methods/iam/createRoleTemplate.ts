/**
 * Create business role template method (orchestration)
 *
 * Sequences create → assign business catalogs → publish locally. Re-running is safe: an existing
 * template is reused and catalogs already assigned are skipped. The publish always runs (unless
 * disabled): nothing on the template reads back whether it was published. The launchpad space is
 * a separate SIAD source object (.assiad) written through upsert.
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, CreateRoleTemplateOptions, RoleTemplateCatalogAssignment, RoleTemplateResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { ok, err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function createRoleTemplate(
    state: ClientState,
    requestor: AdtRequestor,
    options: CreateRoleTemplateOptions
): AsyncResult<RoleTemplateResult> {
    if (!state.session) return err(new Error('Not logged in'));

    const name = options.templateName.toUpperCase();
    const result: RoleTemplateResult = {
        name,
        created: false,
        assignmentsAdded: [],
        published: false,
        publishStatus: '',
        steps: { create: 'SKIPPED', assign: 'SKIPPED', publish: 'SKIPPED' },
    };

    // Step 1: Create the template unless it exists.
    const [existing, readErr] = await adt.readRoleTemplate(requestor, name);
    if (readErr) return err(readErr);

    // Every catalog to assign must exist before anything is written (a clear message rather than SAP's).
    const assignments: RoleTemplateCatalogAssignment[] = [...(existing?.catalogs ?? [])];
    const assigned = new Set(assignments.map(entry => entry.catalog.toUpperCase()));
    const missing = [...new Set(options.catalogs.map(catalog => catalog.toUpperCase()))].filter(catalog => !assigned.has(catalog));
    for (const catalog of missing) {
        const [catalogInfo, catalogErr] = await adt.readBusinessCatalog(requestor, catalog);
        if (catalogErr) return err(catalogErr);
        if (!catalogInfo) return err(new Error(`Business catalog ${catalog} does not exist`));
    }

    if (!existing) {
        const [, createErr] = await adt.createRoleTemplateObject(requestor, name, options.packageName, options.description, options.transport);
        if (createErr) return err(createErr);
        result.created = true;
        result.steps.create = 'DONE';
    }

    // Step 2: Assign the catalogs that are not assigned yet.
    for (const catalog of missing) {
        const [assignment, assignErr] = await adt.createNumberedAssignment(name, assignments, candidate =>
            adt.createRoleTemplateCatalogAssignment(requestor, name, catalog, candidate, options.packageName, options.transport));
        if (assignErr) return err(assignErr);

        const entry = { assignment, catalog };
        assignments.push(entry);
        result.assignmentsAdded.push(entry);
        result.steps.assign = 'DONE';
    }

    // Step 3: Publish locally and wait for it.
    if (options.publish === false) return ok(result);

    const [status, publishErr] = await adt.publishRoleTemplate(requestor, name);
    if (publishErr) return err(publishErr);
    result.publishStatus = status;
    result.published = true;
    result.steps.publish = 'DONE';
    return ok(result);
}
