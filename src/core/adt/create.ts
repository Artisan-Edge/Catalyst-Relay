/**
 * Create — Create new SAP development object
 */

import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { ObjectContent } from '../../types/requests';
import type { AdtRequestor } from './types';
import { escapeXml } from '../utils/xml';
import { checkResponse, requireConfig } from './helpers';

/**
 * Create a new object in SAP
 *
 * @param client - ADT client
 * @param object - Object with content (name, extension, content, description)
 * @param packageName - Target package
 * @param transport - Transport request (required for non-$TMP packages)
 * @param username - Creating user
 * @returns void or error
 */
export async function createObject(
    client: AdtRequestor,
    object: ObjectContent,
    packageName: string,
    transport: string | undefined,
    username: string
): AsyncResult<void, Error> {
    const [config, configErr] = requireConfig(object.extension);
    if (configErr) return err(configErr);

    const description = object.description ?? '';

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<${config.rootName} ${config.nameSpace}
    xmlns:adtcore="http://www.sap.com/adt/core"
    adtcore:description="${escapeXml(description)}"
    adtcore:language="EN"
    adtcore:name="${object.name.toUpperCase()}"
    adtcore:type="${config.type}"
    adtcore:responsible="${username.toUpperCase()}">

    <adtcore:packageRef adtcore:name="${packageName}"/>

</${config.rootName}>`;

    const params: Record<string, string> = {};
    if (transport) {
        params['corrNr'] = transport;
    }

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: `/sap/bc/adt/${config.endpoint}`,
        params,
        headers: { 'Content-Type': 'application/*' },
        body: body.trim(),
    });

    const [_, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to create ${config.label} ${object.name}`
    );
    if (checkErr) return err(checkErr);

    return ok(undefined);
}
