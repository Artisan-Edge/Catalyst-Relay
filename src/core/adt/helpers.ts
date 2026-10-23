/**
 * ADT Helpers — shared utilities for ADT operations
 *
 * Internal helpers used across multiple ADT files.
 * Not exported from the adt/ barrel.
 */

import type { AsyncResult, Result } from '../../types/result';
import { ok, err } from '../../types/result';
import type { ObjectContent, ObjectRef } from '../../types/requests';
import { extractError } from '../utils/xml';
import { getFormHandler } from '../ddic';
import type { FormHandler } from '../ddic';
import { getConfigByExtension } from './types';
import type { ObjectConfig } from './types';

const ADT_ROOT = '/sap/bc/adt';
const CONTAINER_PLACEHOLDER = '{container}';
const FUNCTION_MODULE_URI = /\/functions\/groups\/([^/]+)\/fmodules\//i;

/**
 * Check response for errors and return text content
 */
export async function checkResponse(
    response: Response | null,
    requestErr: Error | null,
    operation: string
): AsyncResult<string, Error> {
    // Handle request errors.
    if (requestErr) return [null, requestErr];
    if (!response) return [null, new Error(`${operation}: No response`)];

    // Handle HTTP errors.
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        // Include status and raw text if no message found for debugging
        if (errorMsg === 'No message found' || errorMsg === 'Failed to parse error XML') {
            return [null, new Error(`${operation}: HTTP ${response.status} - ${text.substring(0, 500)}`)];
        }
        return [null, new Error(`${operation}: ${errorMsg}`)];
    }

    // Return successful response text.
    return [await response.text(), null];
}

/**
 * Validate extension and return config
 */
export function requireConfig(extension: string): [ObjectConfig, null] | [null, Error] {
    // Lookup configuration for extension.
    const config = getConfigByExtension(extension);
    if (!config) return [null, new Error(`Unsupported extension: ${extension}`)];

    // Return valid configuration.
    return [config, null];
}

/**
 * Collection URI (create target), with the container substituted
 */
export function collectionUri(config: ObjectConfig, object: ObjectRef): Result<string, Error> {
    if (!config.endpoint.includes(CONTAINER_PLACEHOLDER)) return ok(`${ADT_ROOT}/${config.endpoint}`);
    if (!object.container) {
        const parent = config.container?.label ?? 'container';
        return err(new Error(`${config.label} ${object.name} needs its ${parent} (ObjectRef.container)`));
    }
    return ok(`${ADT_ROOT}/${config.endpoint.replace(CONTAINER_PLACEHOLDER, object.container.toLowerCase())}`);
}

/**
 * Object URI, e.g. /sap/bc/adt/ddic/domains/zfoo
 */
export function objectUri(config: ObjectConfig, object: ObjectRef): Result<string, Error> {
    const [collection, collectionErr] = collectionUri(config, object);
    if (collectionErr) return err(collectionErr);
    return ok(`${collection}/${object.name.toLowerCase()}`);
}

/**
 * Content URI: /source/main for source objects, the object URI for form objects
 */
export function contentUri(config: ObjectConfig, object: ObjectRef): Result<string, Error> {
    const [uri, uriErr] = objectUri(config, object);
    if (uriErr) return err(uriErr);
    return ok(config.kind === 'form' ? uri : `${uri}/source/main`);
}

/**
 * Lock/unlock/delete URI: the object URI where the type locks on it, else the content URI
 */
export function lockUri(config: ObjectConfig, object: ObjectRef): Result<string, Error> {
    return config.lockOnObject ? objectUri(config, object) : contentUri(config, object);
}

/**
 * Copy of an object reference with only its addressing fields (drops content etc.)
 */
export function toRef(object: ObjectRef): ObjectRef {
    const ref: ObjectRef = { name: object.name, extension: object.extension };
    if (object.container) ref.container = object.container;
    return ref;
}

/**
 * Form handler for a form object's DSL, checking the declared name matches the object name
 */
export function requireFormHandler(object: ObjectContent): Result<FormHandler, Error> {
    const handler = getFormHandler(object.extension);
    if (!handler) return err(new Error(`No form handler for extension: ${object.extension}`));

    const [declared, nameErr] = handler.declaredName(object.content);
    if (nameErr) return err(new Error(`${object.name}.${object.extension}: ${nameErr.message}`));
    if (declared.toUpperCase() !== object.name.toUpperCase()) {
        return err(new Error(`${object.name}.${object.extension} declares '${declared}'; the name must match the object name`));
    }
    return ok(handler);
}

/**
 * Function group name from a function module URI, e.g. …/functions/groups/zfyp7/fmodules/… → ZFYP7
 */
export function containerFromUri(uri: string): string | null {
    const match = FUNCTION_MODULE_URI.exec(uri);
    return match?.[1] ? decodeURIComponent(match[1]).toUpperCase() : null;
}
