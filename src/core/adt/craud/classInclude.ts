/**
 * Class Include — write a global class's local-source include (CCDEF/CCIMP/CCMAC/CCAU)
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { checkResponse, requireConfig } from '../helpers';
import { debug } from '../../utils/logging';

/**
 * Local-source include sections of a global ABAP class.
 *
 * - definitions     → "Class-relevant Local Definitions" (CCDEF)
 * - implementations → "Local Types" (CCIMP) — where RAP behaviour handlers live
 * - macros          → "Macros" (CCMAC)
 * - testclasses     → "Test Classes" (CCAU)
 */
export type ClassIncludeType = 'definitions' | 'implementations' | 'macros' | 'testclasses';

const NOT_FOUND_STATUS = 404;

/**
 * Check whether a class include exists (new classes have no testclasses include)
 *
 * @param client - ADT client
 * @param className - Global class name (e.g., 'ZCL_FOO')
 * @param includeType - Which local-source include to check
 * @returns true if the include exists, false on 404, or error
 */
export async function classIncludeExists(
    client: AdtRequestor,
    className: string,
    includeType: ClassIncludeType
): AsyncResult<boolean, Error> {
    const [config, configErr] = requireConfig('aclass');
    if (configErr) return err(configErr);

    const [response, requestErr] = await client.request({
        method: 'GET',
        path: `/sap/bc/adt/${config.endpoint}/${className.toLowerCase()}/includes/${includeType}`,
        headers: { 'Accept': 'text/plain' },
    });
    if (response?.status === NOT_FOUND_STATUS) return ok(false);

    const [, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to check ${includeType} include of class ${className}`
    );
    if (checkErr) return err(checkErr);

    return ok(true);
}

/**
 * Create an empty class include (the class must be locked)
 *
 * @param client - ADT client
 * @param className - Global class name (e.g., 'ZCL_FOO')
 * @param includeType - Which local-source include to create
 * @param lockHandle - Lock handle from lockObject() on the class
 * @param transport - Transport request (required for non-$TMP packages)
 * @returns void or error
 */
export async function createClassInclude(
    client: AdtRequestor,
    className: string,
    includeType: ClassIncludeType,
    lockHandle: string,
    transport: string | undefined
): AsyncResult<void, Error> {
    const [config, configErr] = requireConfig('aclass');
    if (configErr) return err(configErr);

    const params: Record<string, string> = {
        'lockHandle': lockHandle,
    };
    if (transport) {
        params['corrNr'] = transport;
    }

    // ADT ignores the name; the include is identified by its type.
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<class:abapClassInclude xmlns:adtcore="http://www.sap.com/adt/core" xmlns:class="http://www.sap.com/adt/oo/classes"
    adtcore:name="dummy" class:includeType="${includeType}"/>`;

    debug(`Create class include ${className}/${includeType}`);
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: `/sap/bc/adt/${config.endpoint}/${className.toLowerCase()}/includes`,
        params,
        headers: { 'Content-Type': 'application/*' },
        body,
    });

    const [, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to create ${includeType} include of class ${className}`
    );
    if (checkErr) return err(checkErr);

    return ok(undefined);
}

/**
 * Read the source of a class include
 *
 * @param client - ADT client
 * @param className - Global class name (e.g., 'ZCL_FOO')
 * @param includeType - Which local-source include to read
 * @returns Include source or error
 */
export async function readClassInclude(
    client: AdtRequestor,
    className: string,
    includeType: ClassIncludeType
): AsyncResult<string, Error> {
    // Includes only exist on classes; reuse the class endpoint config.
    const [config, configErr] = requireConfig('aclass');
    if (configErr) return err(configErr);

    // Execute include read request to ADT server.
    debug(`Read class include ${className}/${includeType}`);
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: `/sap/bc/adt/${config.endpoint}/${className.toLowerCase()}/includes/${includeType}`,
        headers: { 'Accept': 'text/plain' },
    });

    // Validate successful response and extract source.
    const [content, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to read ${includeType} include of class ${className}`
    );
    if (checkErr) return err(checkErr);

    return ok(content);
}

/**
 * Write the source of a class include
 *
 * @param client - ADT client
 * @param className - Global class name (e.g., 'ZCL_FOO')
 * @param includeType - Which local-source include to write
 * @param source - New include source
 * @param lockHandle - Lock handle from lockObject() on the class
 * @param transport - Transport request (required for non-$TMP packages)
 * @returns void or error
 */
export async function updateClassInclude(
    client: AdtRequestor,
    className: string,
    includeType: ClassIncludeType,
    source: string,
    lockHandle: string,
    transport: string | undefined
): AsyncResult<void, Error> {
    // Includes only exist on classes; reuse the class endpoint config.
    const [config, configErr] = requireConfig('aclass');
    if (configErr) return err(configErr);

    // Build request parameters with lock handle.
    const params: Record<string, string> = {
        'lockHandle': lockHandle,
    };
    if (transport) {
        params['corrNr'] = transport;
    }

    // Execute include update request to ADT server.
    debug(`Update class include ${className}/${includeType}: length=${source.length}`);
    const [response, requestErr] = await client.request({
        method: 'PUT',
        path: `/sap/bc/adt/${config.endpoint}/${className.toLowerCase()}/includes/${includeType}`,
        params,
        headers: { 'Content-Type': '*/*' },
        body: source,
    });

    // Validate successful response.
    const [, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to write ${includeType} include of class ${className}`
    );
    if (checkErr) return err(checkErr);

    return ok(undefined);
}
