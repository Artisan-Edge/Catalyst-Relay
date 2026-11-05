/**
 * Update — Update existing SAP development object
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { ObjectContent } from '../../../types/requests';
import type { AdtRequestor, ObjectConfig } from '../types';
import type { FormUpdateBody } from '../../forms';
import { checkResponse, contentUri, requireConfig, requireFormHandler, sourceMediaType } from '../helpers';
import { debug } from '../../utils/logging';
import { stripBom } from '../../utils/bom';
import { readFormDocument } from './formDocument';
import { requireAffJsonPaths } from '../aff';

const SOURCE_LABEL = 'source';

/**
 * Update an existing object's source content
 *
 * Form objects may need several PUTs (message classes); when a later one fails, the error
 * says which parts were already saved. A leading BOM is not sent.
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
    const [, requiredErr] = requireAffJsonPaths(object.content, config.affJson, `${config.label} ${object.name}`);
    if (requiredErr) return err(requiredErr);

    // Build request parameters with lock handle.
    const params: Record<string, string> = {
        'lockHandle': lockHandle,
    };
    if (transport) {
        params['corrNr'] = transport;
    }

    // Form objects: apply the source onto the current document (one or more PUTs); source objects send text.
    const [bodies, bodyErr] = config.kind === 'form'
        ? await buildFormBodies(client, config, object, lockHandle)
        : ok<FormUpdateBody[]>([{ label: SOURCE_LABEL, body: stripBom(object.content) }]);
    if (bodyErr) return err(bodyErr);
    const contentType = config.kind === 'form' ? config.contentType ?? 'application/xml' : config.sourceFormat ? sourceMediaType(config) : '*/*';
    const vendorType = contentType.startsWith('application/vnd.') ? contentType : undefined;

    // Execute update requests in order.
    const applied: string[] = [];
    for (const { label, body } of bodies) {
        debug(`Update ${object.name} (${label}): content length=${body.length}`);
        const [response, requestErr] = await client.request({
            method: 'PUT',
            path: uri,
            params,
            headers: { 'Content-Type': contentType },
            body,
        });
        debug(`Update response: ${response?.status ?? 'no response'}, err=${requestErr?.message ?? 'none'}`);

        const [, checkErr] = await checkResponse(response, requestErr, `Failed to update ${config.label} ${object.name}`, vendorType);
        if (checkErr) return err(applied.length === 0 ? checkErr : partialError(config, object, applied, label, checkErr));
        applied.push(label);
    }

    return ok(undefined);
}

// A later PUT failed after earlier ones were saved: say what is on the server now.
function partialError(config: ObjectConfig, object: ObjectContent, applied: string[], failed: string, cause: Error): Error {
    return new Error(`${config.label} ${object.name} was partially updated: saved ${applied.join('; ')}; not saved: ${failed} (${cause.message})`);
}

async function buildFormBodies(client: AdtRequestor, config: ObjectConfig, object: ObjectContent, lockHandle: string): AsyncResult<FormUpdateBody[], Error> {
    const [handler, handlerErr] = requireFormHandler(object);
    if (handlerErr) return err(handlerErr);

    // Fetch the current document so fields the source doesn't model are kept.
    const [xml, readErr] = await readFormDocument(client, config, object);
    if (readErr) return err(readErr);
    return handler.updateBodies(xml, object.content, lockHandle);
}
