// ADT CRAUD — create, read, update, delete operations

import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { ObjectRef, ObjectContent } from '../../types/requests';
import type { ObjectWithContent } from '../../types/responses';
import type { AdtRequestor } from './types';
import { getConfigByExtension } from './types';
import { extractLockHandle, extractError, escapeXml } from '../utils/xml';

// Check response for errors and return text content
async function checkResponse(
    response: Response | null,
    requestErr: Error | null,
    operation: string
): AsyncResult<string, Error> {
    if (requestErr) return [null, requestErr];
    if (!response) return [null, new Error(`${operation}: No response`)];
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return [null, new Error(`${operation}: ${errorMsg}`)];
    }
    return [await response.text(), null];
}

// Validate extension and return config
function requireConfig(extension: string): [import('./types').ObjectConfig, null] | [null, Error] {
    const config = getConfigByExtension(extension);
    if (!config) return [null, new Error(`Unsupported extension: ${extension}`)];
    return [config, null];
}

// ===== Read Operations =====

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

// ===== Lock Management =====

export async function lockObject(
    client: AdtRequestor,
    object: ObjectRef
): AsyncResult<string, Error> {
    const [config, configErr] = requireConfig(object.extension);
    if (configErr) return err(configErr);

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

    const [text, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to lock ${config.label} ${object.name}`
    );
    if (checkErr) return err(checkErr);
    const [lockHandle, extractErr] = extractLockHandle(text);
    if (extractErr) {
        return err(new Error(`Failed to extract lock handle: ${extractErr.message}`));
    }

    return ok(lockHandle);
}

export async function unlockObject(
    client: AdtRequestor,
    object: ObjectRef,
    lockHandle: string
): AsyncResult<void, Error> {
    const [config, configErr] = requireConfig(object.extension);
    if (configErr) return err(configErr);

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: `/sap/bc/adt/${config.endpoint}/${object.name}/source/main`,
        params: {
            '_action': 'UNLOCK',
            'lockHandle': lockHandle,
        },
    });

    const [_, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to unlock ${config.label} ${object.name}`
    );
    if (checkErr) return err(checkErr);

    return ok(undefined);
}

// ===== Create/Update/Delete =====

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

export async function updateObject(
    client: AdtRequestor,
    object: ObjectContent,
    lockHandle: string,
    transport: string | undefined
): AsyncResult<void, Error> {
    const [config, configErr] = requireConfig(object.extension);
    if (configErr) return err(configErr);

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

    const [_, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to update ${config.label} ${object.name}`
    );
    if (checkErr) return err(checkErr);

    return ok(undefined);
}

export async function deleteObject(
    client: AdtRequestor,
    object: ObjectRef,
    lockHandle: string,
    transport: string | undefined
): AsyncResult<void, Error> {
    const [config, configErr] = requireConfig(object.extension);
    if (configErr) return err(configErr);

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

    const [_, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to delete ${config.label} ${object.name}`
    );
    if (checkErr) return err(checkErr);

    return ok(undefined);
}
