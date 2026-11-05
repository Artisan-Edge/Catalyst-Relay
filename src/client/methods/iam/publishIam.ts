/**
 * Publish IAM app / business catalog / role template methods (each waits for SAP's ~2 min publish)
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, IamPublishOptions } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function publishIamApp(state: ClientState, requestor: AdtRequestor, appName: string, options?: IamPublishOptions): AsyncResult<string> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.publishIamApp(requestor, appName, options);
}

export async function publishBusinessCatalog(state: ClientState, requestor: AdtRequestor, catalogName: string, options?: IamPublishOptions): AsyncResult<string> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.publishBusinessCatalog(requestor, catalogName, options);
}

export async function publishRoleTemplate(state: ClientState, requestor: AdtRequestor, templateName: string, options?: IamPublishOptions): AsyncResult<string> {
    if (!state.session) return err(new Error('Not logged in'));
    return adt.publishRoleTemplate(requestor, templateName, options);
}
