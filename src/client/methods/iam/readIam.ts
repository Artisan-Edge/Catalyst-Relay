/**
 * Read IAM app / business catalog methods
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, BusinessCatalogInfo, IamAppInfo } from '../../../core/adt';
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
