/**
 * ADT CRAUD Operations
 *
 * Core create, read, activate, update, delete operations for SAP development objects.
 * All functions use error tuples and guard clauses per project standards.
 */

import { DOMParser } from '@xmldom/xmldom';
import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { ObjectRef, ObjectContent } from '../../types/requests';
import type { ObjectWithContent, ActivationResult, ActivationMessage } from '../../types/responses';
import { getConfigByExtension } from './types';
import { extractLockHandle, extractError, escapeXml } from '../utils/xml';

/**
 * Internal request interface for ADT client
 * This abstracts the HTTP request method from client.ts
 */
export interface AdtRequestor {
    request(options: {
        method: 'GET' | 'POST' | 'PUT' | 'DELETE';
        path: string;
        params?: Record<string, string | number>;
        headers?: Record<string, string>;
        body?: string;
    }): AsyncResult<Response, Error>;
}

/**
 * Read a single object with its content
 *
 * @param client - ADT client with request method
 * @param object - Object reference to read
 * @returns Object with content or error
 */
export async function readObject(
    client: AdtRequestor,
    object: ObjectRef
): AsyncResult<ObjectWithContent, Error> {
    const config = getConfigByExtension(object.extension);
    if (!config) {
        return err(new Error(`Unsupported extension: ${object.extension}`));
    }

    const [response, requestErr] = await client.request({
        method: 'GET',
        path: `/sap/bc/adt/${config.endpoint}/${object.name}/source/main`,
        headers: { 'Accept': 'text/plain' },
    });

    if (requestErr) {
        return err(requestErr);
    }

    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Failed to read ${config.label} ${object.name}: ${errorMsg}`));
    }

    const content = await response.text();

    const result: ObjectWithContent = {
        name: object.name,
        extension: object.extension,
        package: '',
        content,
    };

    return ok(result);
}

/**
 * Lock an object for modification
 *
 * @param client - ADT client
 * @param object - Object to lock
 * @returns Lock handle or error
 */
export async function lockObject(
    client: AdtRequestor,
    object: ObjectRef
): AsyncResult<string, Error> {
    const config = getConfigByExtension(object.extension);
    if (!config) {
        return err(new Error(`Unsupported extension: ${object.extension}`));
    }

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: `/sap/bc/adt/${config.endpoint}/${object.name}/source/main`,
        params: {
            '_action': 'LOCK',
            'accessMode': 'MODIFY',
        },
        headers: {
            'Accept': 'application/*,application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result',
        },
    });

    if (requestErr) {
        return err(requestErr);
    }

    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Failed to lock ${config.label} ${object.name}: ${errorMsg}`));
    }

    const text = await response.text();
    const [lockHandle, extractErr] = extractLockHandle(text);
    if (extractErr) {
        return err(new Error(`Failed to extract lock handle: ${extractErr.message}`));
    }

    return ok(lockHandle);
}

/**
 * Unlock an object
 *
 * @param client - ADT client
 * @param object - Object to unlock
 * @param lockHandle - Lock handle from lockObject
 * @returns Success or error
 */
export async function unlockObject(
    client: AdtRequestor,
    object: ObjectRef,
    lockHandle: string
): AsyncResult<void, Error> {
    const config = getConfigByExtension(object.extension);
    if (!config) {
        return err(new Error(`Unsupported extension: ${object.extension}`));
    }

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: `/sap/bc/adt/${config.endpoint}/${object.name}/source/main`,
        params: {
            '_action': 'UNLOCK',
            'lockHandle': lockHandle,
        },
    });

    if (requestErr) {
        return err(requestErr);
    }

    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Failed to unlock ${config.label} ${object.name}: ${errorMsg}`));
    }

    return ok(undefined);
}

/**
 * Create a new object
 *
 * @param client - ADT client
 * @param object - Object content to create
 * @param packageName - Parent package name
 * @param transport - Transport request (optional)
 * @param username - User creating the object
 * @returns Success or error
 */
export async function createObject(
    client: AdtRequestor,
    object: ObjectContent,
    packageName: string,
    transport: string | undefined,
    username: string
): AsyncResult<void, Error> {
    const config = getConfigByExtension(object.extension);
    if (!config) {
        return err(new Error(`Unsupported extension: ${object.extension}`));
    }

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

    if (requestErr) {
        return err(requestErr);
    }

    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Failed to create ${config.label} ${object.name}: ${errorMsg}`));
    }

    return ok(undefined);
}

/**
 * Update an existing object
 *
 * @param client - ADT client
 * @param object - Object with new content
 * @param lockHandle - Lock handle from lockObject
 * @param transport - Transport request (optional)
 * @returns Success or error
 */
export async function updateObject(
    client: AdtRequestor,
    object: ObjectContent,
    lockHandle: string,
    transport: string | undefined
): AsyncResult<void, Error> {
    const config = getConfigByExtension(object.extension);
    if (!config) {
        return err(new Error(`Unsupported extension: ${object.extension}`));
    }

    const params: Record<string, string> = {
        'lockHandle': lockHandle,
    };
    if (transport) {
        params['corrNr'] = transport;
    }

    const [response, requestErr] = await client.request({
        method: 'PUT',
        path: `/sap/bc/adt/${config.endpoint}/${object.name}/source/main`,
        params,
        headers: { 'Content-Type': '*/*' },
        body: object.content,
    });

    if (requestErr) {
        return err(requestErr);
    }

    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Failed to update ${config.label} ${object.name}: ${errorMsg}`));
    }

    return ok(undefined);
}

/**
 * Delete an object
 *
 * @param client - ADT client
 * @param object - Object to delete
 * @param lockHandle - Lock handle from lockObject
 * @param transport - Transport request (optional)
 * @returns Success or error
 */
export async function deleteObject(
    client: AdtRequestor,
    object: ObjectRef,
    lockHandle: string,
    transport: string | undefined
): AsyncResult<void, Error> {
    const config = getConfigByExtension(object.extension);
    if (!config) {
        return err(new Error(`Unsupported extension: ${object.extension}`));
    }

    const params: Record<string, string> = {
        'lockHandle': lockHandle,
    };
    if (transport) {
        params['corrNr'] = transport;
    }

    const [response, requestErr] = await client.request({
        method: 'DELETE',
        path: `/sap/bc/adt/${config.endpoint}/${object.name}/source/main`,
        params,
        headers: { 'Accept': 'text/plain' },
    });

    if (requestErr) {
        return err(requestErr);
    }

    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Failed to delete ${config.label} ${object.name}: ${errorMsg}`));
    }

    return ok(undefined);
}

/**
 * Activate multiple objects
 *
 * @param client - ADT client
 * @param objects - Objects to activate (must all have same extension)
 * @returns Activation results for each object
 */
export async function activateObjects(
    client: AdtRequestor,
    objects: ObjectRef[]
): AsyncResult<ActivationResult[], Error> {
    if (objects.length === 0) {
        return ok([]);
    }

    const extension = objects[0]!.extension;
    const config = getConfigByExtension(extension);
    if (!config) {
        return err(new Error(`Unsupported extension: ${extension}`));
    }

    // Verify all objects have same extension
    for (const obj of objects) {
        if (obj.extension !== extension) {
            return err(new Error('All objects must have the same extension for batch activation'));
        }
    }

    const objectRefs = objects.map(obj => `<adtcore:objectReference
                adtcore:uri="/sap/bc/adt/${config.endpoint}/${obj.name.toLowerCase()}"
                adtcore:type="${config.type}"
                adtcore:name="${obj.name}"
                adtcore:description="*"/>`).join('\n            ');

    const body = `<?xml version="1.0" encoding="UTF-8"?>
            <adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
            ${objectRefs}
            </adtcore:objectReferences>`;

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/activation',
        params: {
            'method': 'activate',
            'preAuditRequested': 'true',
        },
        headers: {
            'Content-Type': 'application/xml',
            'Accept': 'application/xml',
        },
        body,
    });

    if (requestErr) {
        return err(requestErr);
    }

    const text = await response.text();

    if (!response.ok) {
        const errorMsg = extractError(text);
        return err(new Error(`Activation failed: ${errorMsg}`));
    }

    const [results, parseErr] = extractActivationErrors(objects, text, extension);
    if (parseErr) {
        return err(parseErr);
    }

    return ok(results);
}

/**
 * Extract activation errors from SAP response XML
 *
 * @param objects - Objects that were activated
 * @param xml - Activation response XML
 * @param extension - Object extension
 * @returns Activation results or error
 */
function extractActivationErrors(
    objects: ObjectRef[],
    xml: string,
    extension: string
): [ActivationResult[], null] | [null, Error] {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');

        const errorMap: Map<string, ActivationMessage[]> = new Map();
        objects.forEach(obj => errorMap.set(obj.name.toLowerCase(), []));

        const msgElements = doc.getElementsByTagName('msg');
        const startRegex = /#start=(\d+),(\d+)/;

        for (let i = 0; i < msgElements.length; i++) {
            const msg = msgElements[i];
            if (!msg) continue;

            const type = msg.getAttribute('type');

            if (type === 'W') {
                continue;
            }

            const objDescr = msg.getAttribute('objDescr');
            const href = msg.getAttribute('href');

            if (!objDescr || !href) {
                continue;
            }

            let line: number | undefined;
            let column: number | undefined;

            const match = startRegex.exec(href);
            if (match && match[1] && match[2]) {
                line = parseInt(match[1], 10);
                column = parseInt(match[2], 10);
            }

            if (!line || !column) {
                continue;
            }

            const matchingObj = objects.find(obj =>
                objDescr.toLowerCase().includes(obj.name.toLowerCase())
            );

            if (!matchingObj) {
                continue;
            }

            const shortTextElements = msg.getElementsByTagName('txt');
            for (let j = 0; j < shortTextElements.length; j++) {
                const txt = shortTextElements[j];
                if (!txt) continue;

                const text = txt.textContent;

                if (text) {
                    const message: ActivationMessage = {
                        severity: type === 'E' ? 'error' : 'warning',
                        text,
                        line,
                        column,
                    };

                    const messages = errorMap.get(matchingObj.name.toLowerCase()) || [];
                    messages.push(message);
                    errorMap.set(matchingObj.name.toLowerCase(), messages);
                }
            }
        }

        const results: ActivationResult[] = objects.map(obj => {
            const messages = errorMap.get(obj.name.toLowerCase()) || [];
            const hasErrors = messages.some(m => m.severity === 'error');

            return {
                name: obj.name,
                extension: obj.extension,
                status: hasErrors ? 'error' : messages.length > 0 ? 'warning' : 'success',
                messages,
            };
        });

        return [results, null];
    } catch (error) {
        if (error instanceof Error) {
            return [null, error];
        }
        return [null, new Error('Failed to parse activation response')];
    }
}
