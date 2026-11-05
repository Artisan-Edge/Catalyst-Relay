/**
 * Object Exists — whether an object is in the repository
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor } from '../types';
import { checkResponse, objectUri, requireConfig } from '../helpers';

const NOT_FOUND = 404;

/**
 * GET the object URI: 404 means the object does not exist
 *
 * Deletes need this: SAP answers a delete of a missing message class with success, and of a
 * missing CDS view or access control with "cannot be created without a package".
 *
 * @returns true when the object exists, false on 404, an error for any other failure
 */
export async function objectExists(client: AdtRequestor, object: ObjectRef): AsyncResult<boolean, Error> {
    const [config, configErr] = requireConfig(object.extension);
    if (configErr) return err(configErr);
    const [uri, uriErr] = objectUri(config, object);
    if (uriErr) return err(uriErr);

    const [response, requestErr] = await client.request({ method: 'GET', path: uri, headers: { 'Accept': 'application/*' } });
    if (requestErr) return err(requestErr);
    if (response.status === NOT_FOUND) return ok(false);
    if (response.ok) return ok(true);

    const [, checkErr] = await checkResponse(response, null, `Failed to look up ${config.label} ${object.name}`);
    return err(checkErr ?? new Error(`Failed to look up ${config.label} ${object.name}`));
}
