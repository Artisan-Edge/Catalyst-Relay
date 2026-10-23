/**
 * Form Document — fetch the XML document of a form-based object (data element, domain)
 */

import type { AsyncResult } from '../../../types/result';
import { err } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor, ObjectConfig } from '../types';
import { checkResponse, objectUri } from '../helpers';

/**
 * GET a form object's document (the inactive version when one exists)
 *
 * @param client - ADT client
 * @param config - Object type configuration (kind 'form')
 * @param object - Object reference
 * @returns Raw XML or error
 */
export async function readFormDocument(client: AdtRequestor, config: ObjectConfig, object: ObjectRef): AsyncResult<string, Error> {
    const [uri, uriErr] = objectUri(config, object);
    if (uriErr) return err(uriErr);

    const [response, requestErr] = await client.request({
        method: 'GET',
        path: uri,
        headers: { 'Accept': config.contentType ?? 'application/xml' },
    });
    return checkResponse(response, requestErr, `Failed to read ${config.label} ${object.name}`);
}
