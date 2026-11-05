/**
 * Read IAM app / business catalog / role template methods
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, BusinessCatalogInfo, IamAppInfo, RoleTemplateInfo } from '../../../core/adt';
import type { ClientState } from '../../types';
import { ok, err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function readIamApp(
    state: ClientState,
    requestor: AdtRequestor,
    appName: string
): AsyncResult<IamAppInfo> {
    if (!state.session) return err(new Error('Not logged in'));

    const [app, readErr] = await adt.readIamApp(requestor, appName);
    if (readErr) return err(readErr);
    if (!app) return err(new Error(`IAM app ${appName.toUpperCase()} does not exist`));
    return ok(app);
}

export async function readBusinessCatalog(
    state: ClientState,
    requestor: AdtRequestor,
    catalogName: string
): AsyncResult<BusinessCatalogInfo> {
    if (!state.session) return err(new Error('Not logged in'));

    const [catalog, readErr] = await adt.readBusinessCatalog(requestor, catalogName);
    if (readErr) return err(readErr);
    if (!catalog) return err(new Error(`Business catalog ${catalogName.toUpperCase()} does not exist`));
    return ok(catalog);
}

export async function readRoleTemplate(
    state: ClientState,
    requestor: AdtRequestor,
    templateName: string
): AsyncResult<RoleTemplateInfo> {
    if (!state.session) return err(new Error('Not logged in'));

    const [template, readErr] = await adt.readRoleTemplate(requestor, templateName);
    if (readErr) return err(readErr);
    if (!template) return err(new Error(`Business role template ${templateName.toUpperCase()} does not exist`));
    return ok(template);
}
