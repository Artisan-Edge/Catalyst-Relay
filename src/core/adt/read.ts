/**
 * POST /objects/read — Read object source content
 */

import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { ObjectRef } from '../../types/requests';
import type { AdtRequestor } from './types';
import { checkResponse, requireConfig } from './helpers';

/**
 * Object metadata
 */
export interface ObjectMetadata {
    name: string;
    extension: string;
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

    // Execute GET request for object source content.
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: `/sap/bc/adt/${config.endpoint}/${object.name}/source/main`,
        headers: { 'Accept': 'text/plain' },
    });

    // Validate successful response and extract content.
    const [content, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to read ${config.label} ${object.name}`
    );
    if (checkErr) return err(checkErr);

    // Build result object with content.
    const result: ObjectWithContent = {
        name: object.name,
        extension: object.extension,
        package: '',
        content,
    };

    return ok(result);
}
