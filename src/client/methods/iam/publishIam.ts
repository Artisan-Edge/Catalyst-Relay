/**
 * Publish IAM app / business catalog / role template methods (each waits for SAP's ~2 min publish)
 */

import type { AsyncResult } from '../../../types/result';
import type { AdtRequestor, IamPublishOptions } from '../../../core/adt';
import { IamPublishError } from '../../../core/adt';
import type { ClientState } from '../../types';
import { err } from '../../../types/result';
import * as adt from '../../../core/adt';

export async function publishIamApp(state: ClientState, requestor: AdtRequestor, appName: string, options?: IamPublishOptions): AsyncResult<string, IamPublishError> {
    if (!state.session) return err(notLoggedIn('sia6', appName));
    return adt.publishIamApp(requestor, appName, options);
}

export async function publishBusinessCatalog(state: ClientState, requestor: AdtRequestor, catalogName: string, options?: IamPublishOptions): AsyncResult<string, IamPublishError> {
    if (!state.session) return err(notLoggedIn('sia1', catalogName));
    return adt.publishBusinessCatalog(requestor, catalogName, options);
}

export async function publishRoleTemplate(state: ClientState, requestor: AdtRequestor, templateName: string, options?: IamPublishOptions): AsyncResult<string, IamPublishError> {
    if (!state.session) return err(notLoggedIn('sia8', templateName));
    return adt.publishRoleTemplate(requestor, templateName, options);
}

function notLoggedIn(kind: 'sia6' | 'sia1' | 'sia8', name: string): IamPublishError {
    return new IamPublishError('Not logged in', kind, name.trim().toUpperCase(), 'request', null);
}
