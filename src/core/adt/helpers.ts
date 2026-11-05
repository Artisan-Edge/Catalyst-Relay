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
import { getFormHandler } from '../forms';
import type { FormHandler } from '../forms';
import { getConfigByExtension, SOURCE_FORMAT_MEDIA_TYPES } from './types';
import type { LockTarget, ObjectConfig } from './types';

const ADT_ROOT = '/sap/bc/adt';
const CONTAINER_PLACEHOLDER = '{container}';
const NOT_ACCEPTABLE = 406;
const UNSUPPORTED_MEDIA_TYPE = 415;
const NOT_ACCEPTABLE_EXCEPTION = 'ExceptionResourceNotAcceptable';
const NO_MESSAGE = ['No message found', 'No error message found', 'Failed to parse error XML'];
const PLAIN_TEXT = 'text/plain';

/**
 * Check response for errors and return text content
 *
 * @param mediaType - Vendor media type the request sent or asked for; a 406/415 naming it
 *   is reported as unsupported by the SAP release
 */
export async function checkResponse(
    response: Response | null,
    requestErr: Error | null,
    operation: string,
    mediaType?: string
): AsyncResult<string, Error> {
    // Handle request errors.
    if (requestErr) return [null, requestErr];
    if (!response) return [null, new Error(`${operation}: No response`)];

    // Handle HTTP errors.
    if (!response.ok) {
        const text = await response.text();
        const unsupported = mediaType ? mediaTypeError(response.status, text, mediaType, operation) : null;
        if (unsupported) return [null, unsupported];
        const errorMsg = extractError(text);
        // Include status and raw text if no message found for debugging
        if (NO_MESSAGE.includes(errorMsg)) {
            return [null, new Error(`${operation}: HTTP ${response.status} - ${text.substring(0, 500)}`)];
        }
        return [null, new Error(`${operation}: ${errorMsg}`)];
    }

    // Return successful response text.
    return [await response.text(), null];
}

/**
 * Error for a 406/415 that means the SAP release does not know a media type, else null
 *
 * 415 always means the request body's type is unknown. 406 means so only when SAP says the
 * content is not acceptable (or says nothing): ADT also answers 406 for invalid content.
 */
export function mediaTypeError(status: number, body: string, mediaType: string, operation: string): Error | null {
    if (status !== NOT_ACCEPTABLE && status !== UNSUPPORTED_MEDIA_TYPE) return null;
    const message = extractError(body);
    const hasMessage = !NO_MESSAGE.includes(message);
    if (status === NOT_ACCEPTABLE && hasMessage && !body.includes(NOT_ACCEPTABLE_EXCEPTION)) return null;

    const detail = hasMessage ? ` (SAP: ${message})` : '';
    return new Error(`${operation}: not supported on this SAP release — it does not accept ${mediaType} (HTTP ${status})${detail}`);
}

/**
 * Media type of a source object's /source/main (plain text unless the type declares a format)
 */
export function sourceMediaType(config: ObjectConfig): string {
    return config.sourceFormat ? SOURCE_FORMAT_MEDIA_TYPES[config.sourceFormat] : PLAIN_TEXT;
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
 * Lock target of an object (its lock URI and "<Label> <NAME>")
 */
export function objectLockTarget(object: ObjectRef): Result<LockTarget, Error> {
    const [config, configErr] = requireConfig(object.extension);
    if (configErr) return err(configErr);
    const [uri, uriErr] = lockUri(config, object);
    if (uriErr) return err(uriErr);
    return ok({ uri, label: `${config.label} ${object.name}` });
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
 * Form handler for a form object's source, checking any declared name matches the object name
 */
export function requireFormHandler(object: ObjectContent): Result<FormHandler, Error> {
    const handler = getFormHandler(object.extension);
    if (!handler) return err(new Error(`No form handler for extension: ${object.extension}`));

    const [declared, nameErr] = handler.declaredName(object.content);
    if (nameErr) return err(new Error(`${object.name}.${object.extension}: ${nameErr.message}`));
    if (declared !== null && declared.toUpperCase() !== object.name.toUpperCase()) {
        return err(new Error(`${object.name}.${object.extension} declares '${declared}'; the name must match the object name`));
    }
    return ok(handler);
}
