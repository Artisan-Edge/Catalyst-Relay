/**
 * Create business role template method (orchestration)
 *
 * Sequences create → assign business catalogs → publish locally. Re-running is safe: an existing
 * template is reused (it must be in the requested package) and catalogs already assigned are
 * skipped. The name must leave room for <name>_NNNN assignments, and every catalog must exist,
 * before anything is written. When SAP says an assignment name exists, the assignments are
 * re-listed and a catalog assigned meanwhile is reported as found. The description is set on
 * create only. The publish always runs (unless disabled): nothing on the template reads back
 * whether it was published; a failed or pending publish is returned as publishError beside the
 * rest of the result. The launchpad space is a separate SIAD source object (.assiad) written
 * through upsert.
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, CreateRoleTemplateOptions, RoleTemplateCatalogAssignment, RoleTemplateResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { ok, err } from '../../../types/result';
import * as adt from '../../../core/adt';
import { publishOptionsWithin } from './publishWithin';

export async function createRoleTemplate(
    state: ClientState,
    requestor: AdtRequestor,
    options: CreateRoleTemplateOptions
): AsyncResult<RoleTemplateResult> {
    if (!state.session) return err(new Error('Not logged in'));

    const startedAt = Date.now();
    const name = adt.iamName(options.templateName);
    if (!name) return err(new Error('Business role template name is required'));
    const result: RoleTemplateResult = {
        name,
        created: false,
        changed: false,
        descriptionUpdated: false,
        descriptionDiffers: false,
        assignmentsAdded: [],
        assignmentsFound: [],
        published: false,
        publishStatus: '',
        steps: { create: 'SKIPPED', assign: 'SKIPPED', publish: 'SKIPPED' },
    };

    // Step 1: Create the template unless it exists (an existing one must be in the requested package).
    const [existing, readErr] = await adt.readRoleTemplate(requestor, name);
    if (readErr) return err(readErr);
    if (existing) {
        const [, packageErr] = adt.requireSamePackage('sia8', name, existing.packageName, options.packageName);
        if (packageErr) return err(packageErr);
        result.descriptionDiffers = existing.description !== adt.iamDescription(options.description || name);
    }

    // Before anything is written: room for <name>_NNNN, and every catalog exists (a clear message rather than SAP's).
    const assignments: RoleTemplateCatalogAssignment[] = [...(existing?.catalogs ?? [])];
    const assigned = new Set(assignments.map(entry => entry.catalog.toUpperCase()));
    const missing = [...new Set(options.catalogs.map(catalog => adt.iamName(catalog)).filter(Boolean))].filter(catalog => !assigned.has(catalog));
    const nameErr = missing.length > 0 ? adt.assignmentOwnerNameError('Business role template', name) : null;
    if (nameErr) return err(nameErr);
    for (const catalog of missing) {
        const [catalogInfo, catalogErr] = await adt.readBusinessCatalog(requestor, catalog);
        if (catalogErr) return err(catalogErr);
        if (!catalogInfo) return err(new Error(`Business catalog ${catalog} does not exist`));
    }

    if (!existing) {
        const [, createErr] = await adt.createRoleTemplateObject(requestor, name, options.packageName, options.description, options.transport);
        if (createErr) return err(createErr);
        result.created = true;
        result.changed = true;
        result.steps.create = 'DONE';
    }

    // Step 2: Assign the catalogs that are not assigned yet.
    for (const catalog of missing) {
        const findExisting = async (): AsyncResult<string | null> => {
            const [listed, listErr] = await adt.readRoleTemplateCatalogs(requestor, name);
            if (listErr) return err(listErr);
            return ok(listed.find(entry => entry.catalog.toUpperCase() === catalog)?.assignment ?? null);
        };
        const [made, assignErr] = await adt.createNumberedAssignment(name, assignments, candidate =>
            adt.createRoleTemplateCatalogAssignment(requestor, name, catalog, candidate, options.packageName, options.transport), findExisting);
        if (assignErr) return err(assignErr);

        const entry = { assignment: made.assignment, catalog };
        assignments.push(entry);
        if (!made.created) {
            result.assignmentsFound.push(entry);
            continue;
        }
        result.assignmentsAdded.push(entry);
        result.changed = true;
        result.steps.assign = 'DONE';
    }

    // Step 3: Publish locally and wait for it; a failure is reported beside the result, not instead of it.
    if (options.publish === false) return ok(result);

    const [status, publishErr] = await adt.publishRoleTemplate(requestor, name, publishOptionsWithin(startedAt, options.deadlineMs));
    if (publishErr) {
        result.publishError = publishErr;
        return ok(result);
    }
    result.publishStatus = status;
    result.published = true;
    result.steps.publish = 'DONE';
    return ok(result);
}
