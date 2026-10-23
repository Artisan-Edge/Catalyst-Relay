/**
 * Update — Update existing SAP development object
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { ObjectContent } from '../../../types/requests';
import type { AdtRequestor, ObjectConfig } from '../types';
import { checkResponse, contentUri, requireConfig, requireFormHandler } from '../helpers';
import { debug } from '../../utils/logging';
import { readFormDocument } from './formDocument';

/**
 * Update an existing object's source content
 *
 * @param client - ADT client
 * @param object - Object with new content
 * @param lockHandle - Lock handle from lockObject()
 * @param transport - Transport request (required for non-$TMP packages)
 * @returns void or error
 */
export async function updateObject(
    client: AdtRequestor,
    object: ObjectContent,
    lockHandle: string,
    transport: string | undefined
): AsyncResult<void, Error> {
    // Validate object extension is supported.
    const [config, configErr] = requireConfig(object.extension);
    if (configErr) return err(configErr);
    const [uri, uriErr] = contentUri(config, object);
    if (uriErr) return err(uriErr);

    // Build request parameters with lock handle.
    const params: Record<string, string> = {
        'lockHandle': lockHandle,
    };
    if (transport) {
        params['corrNr'] = transport;
    }

    // Form objects: merge the DSL onto the current document; source objects send text.
    const [body, bodyErr] = config.kind === 'form'
        ? await buildFormBody(client, config, object)
        : ok(object.content);
    if (bodyErr) return err(bodyErr);
    const contentType = config.kind === 'form' ? config.contentType ?? 'application/xml' : '*/*';

    // Execute update request to ADT server.
    debug(`Update ${object.name}: content length=${body.length}`);
    const [response, requestErr] = await client.request({
        method: 'PUT',
        path: uri,
        params,
        headers: { 'Content-Type': contentType },
        body,
    });
    debug(`Update response: ${response?.status ?? 'no response'}, err=${requestErr?.message ?? 'none'}`);

    // Validate successful response.
    const [_, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to update ${config.label} ${object.name}`
    );
    if (checkErr) return err(checkErr);

    return ok(undefined);
}

async function buildFormBody(client: AdtRequestor, config: ObjectConfig, object: ObjectContent): AsyncResult<string, Error> {
    const [handler, handlerErr] = requireFormHandler(object);
    if (handlerErr) return err(handlerErr);

    // Fetch the current document so fields the DSL doesn't model are kept.
    const [xml, readErr] = await readFormDocument(client, config, object);
    if (readErr) return err(readErr);
    return handler.mergeXml(xml, object.content);
}
