/**
 * POST /objects/read — Read object source content
 */

import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { ObjectRef } from '../../types/requests';
import type { ObjectWithContent } from '../../types/responses';
import type { AdtRequestor } from './types';
import { checkResponse, requireConfig } from './helpers';

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
    const [config, configErr] = requireConfig(object.extension);
    if (configErr) return err(configErr);

    const [response, requestErr] = await client.request({
        method: 'GET',
        path: `/sap/bc/adt/${config.endpoint}/${object.name}/source/main`,
        headers: { 'Accept': 'text/plain' },
    });

    const [content, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to read ${config.label} ${object.name}`
    );
    if (checkErr) return err(checkErr);

    const result: ObjectWithContent = {
        name: object.name,
        extension: object.extension,
        package: '',
        content,
    };

    return ok(result);
}
