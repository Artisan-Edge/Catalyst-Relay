/**
 * Create — Create new SAP development object
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { ObjectContent } from '../../../types/requests';
import { BehaviorImplementationType } from '../../../types/requests';
import type { AdtRequestor } from '../types';
import { escapeXml } from '../../utils/xml';
import { checkResponse, collectionUri, requireConfig, requireFormHandler } from '../helpers';

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
    // Validate object extension is supported.
    const [config, configErr] = requireConfig(object.extension);
    if (configErr) return err(configErr);
    const [path, pathErr] = collectionUri(config, object);
    if (pathErr) return err(pathErr);

    // Add transport parameter if provided.
    const params: Record<string, string> = {};
    if (transport) {
        params['corrNr'] = transport;
    }

    // Form objects: one POST of the full document built from the DSL.
    if (config.kind === 'form') {
        const [handler, handlerErr] = requireFormHandler(object);
        if (handlerErr) return err(handlerErr);
        const [xml, buildErr] = handler.buildXml(object.content, { packageName, responsible: username });
        if (buildErr) return err(buildErr);

        const [response, requestErr] = await client.request({
            method: 'POST',
            path,
            params,
            headers: { 'Content-Type': config.contentType ?? 'application/xml' },
            body: xml,
        });
        const [, checkErr] = await checkResponse(response, requestErr, `Failed to create ${config.label} ${object.name}`);
        if (checkErr) return err(checkErr);
        return ok(undefined);
    }

    // Default empty description if not provided.
    const description = object.description ?? '';

    // Extra root attributes for types that need them (e.g. srvd:srvdSourceType).
    const extraAttrs = config.rootAttributes
        ? Object.entries(config.rootAttributes)
            .map(([key, value]) => `\n    ${key}="${escapeXml(value)}"`)
            .join('')
        : '';

    // Behavior definitions carry their implementation type in an adtTemplate block.
    const implementationType = object.implementationType ?? BehaviorImplementationType.Managed;
    const adtTemplate = config.requiresImplementationType
        ? `    <adtcore:adtTemplate>
        <adtcore:adtProperty adtcore:key="implementation_type">${implementationType}</adtcore:adtProperty>
    </adtcore:adtTemplate>`
        : '';

    // Nested objects (function modules) reference their container instead of a package.
    const owner = config.container && object.container
        ? `<adtcore:containerRef adtcore:name="${escapeXml(object.container.toUpperCase())}" adtcore:type="${config.container.type}" adtcore:uri="/sap/bc/adt/${config.container.endpoint}/${escapeXml(object.container.toLowerCase())}"/>`
        : `<adtcore:packageRef adtcore:name="${packageName}"/>`;

    // Build XML request body with object metadata.
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<${config.rootName} ${config.nameSpace}
    xmlns:adtcore="http://www.sap.com/adt/core"
    adtcore:description="${escapeXml(description)}"
    adtcore:language="EN"
    adtcore:name="${object.name.toUpperCase()}"
    adtcore:type="${config.type}"
    adtcore:responsible="${username.toUpperCase()}"${extraAttrs}>
${adtTemplate}
    ${owner}

</${config.rootName}>`;

    // Execute create request.
    const [response, requestErr] = await client.request({
        method: 'POST',
        path,
        params,
        headers: { 'Content-Type': 'application/*' },
        body: body.trim(),
    });

    // Validate successful response.
    const [_, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to create ${config.label} ${object.name}`
    );
    if (checkErr) return err(checkErr);

    return ok(undefined);
}
