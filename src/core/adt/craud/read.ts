/**
 * POST /objects/read — Read object source content
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor, ObjectConfig } from '../types';
import { checkResponse, contentUri, requireConfig } from '../helpers';
import { getFormHandler } from '../../ddic';
import { readFormDocument } from './formDocument';

/**
 * Object metadata
 */
export interface ObjectMetadata {
    name: string;
    extension: string;
    /** Function group of a function module */
    container?: string;
    package: string;
    description?: string;
    createdBy?: string;
    createdAt?: string;
    modifiedBy?: string;
    modifiedAt?: string;
}

/**
 * Object with content (read response)
 */
export interface ObjectWithContent extends ObjectMetadata {
    content: string;
}

/**
 * Read object source content
 *
 * @param client - ADT client
 * @param object - Object reference (name + extension)
 * @returns Object with content or error
 */
export async function readObject(
    client: AdtRequestor,
    object: ObjectRef
): AsyncResult<ObjectWithContent, Error> {
    // Validate object extension is supported.
    const [config, configErr] = requireConfig(object.extension);
    if (configErr) return err(configErr);

    // Form objects: fetch the XML document and render it as canonical DSL.
    const [content, contentErr] = config.kind === 'form'
        ? await readFormSource(client, config, object)
        : await readSource(client, config, object);
    if (contentErr) return err(contentErr);

    // Build result object with content.
    const result: ObjectWithContent = {
        name: object.name,
        extension: object.extension,
        package: '',
        content,
    };
    if (object.container) result.container = object.container;

    return ok(result);
}

async function readSource(client: AdtRequestor, config: ObjectConfig, object: ObjectRef): AsyncResult<string, Error> {
    const [uri, uriErr] = contentUri(config, object);
    if (uriErr) return err(uriErr);

    const [response, requestErr] = await client.request({
        method: 'GET',
        path: uri,
        headers: { 'Accept': 'text/plain' },
    });
    return checkResponse(response, requestErr, `Failed to read ${config.label} ${object.name}`);
}

async function readFormSource(client: AdtRequestor, config: ObjectConfig, object: ObjectRef): AsyncResult<string, Error> {
    const handler = getFormHandler(object.extension);
    if (!handler) return err(new Error(`No form handler for extension: ${object.extension}`));

    const [xml, readErr] = await readFormDocument(client, config, object);
    if (readErr) return err(readErr);
    return handler.toSource(xml);
}
