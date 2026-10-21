/**
 * Set State — validation run and PUT shared by release, unrelease and visibility edits
 *
 * SAP performs a C1 contract change in two steps: a validation run (pre-flight,
 * surfaces warnings/errors) followed by the actual PUT. Warnings are
 * non-blocking and returned to the caller; errors abort before the PUT.
 */

import type { AsyncResult } from '../../../../types/result';
import { ok, err } from '../../../../types/result';
import type { AdtRequestor } from '../../types';
import { checkResponse } from '../../helpers';
import type { ApiReleaseResult, ApiReleaseStatus, ApiReleaseValidationMessage, ApiReleaseVisibility } from './types';
import {
    APIRELEASE_MEDIA_TYPE,
    APIRELEASE_VALIDATION_CONTENT_TYPE,
    APIRELEASE_VALIDATION_ACCEPT,
    buildC1ReleaseBody,
    buildContractPath,
    buildValidationRunPath,
    collectErrors,
    parseReleaseState,
    parseValidationMessages,
} from './helpers';

/**
 * Run SAP's validation for a C1 contract change without applying it.
 *
 * @returns Non-blocking messages, or error when the validation reports errors
 */
export async function validateApiReleaseChange(
    client: AdtRequestor,
    objectName: string,
    status: ApiReleaseStatus,
    visibility: ApiReleaseVisibility
): AsyncResult<ApiReleaseValidationMessage[], Error> {
    // The validation endpoint returns its own contract-validation media type;
    // the body remains the apiRelease type.
    const [validationRes, validationReqErr] = await client.request({
        method: 'POST',
        path: buildValidationRunPath(objectName),
        headers: {
            'Content-Type': APIRELEASE_VALIDATION_CONTENT_TYPE,
            'Accept': APIRELEASE_VALIDATION_ACCEPT,
        },
        body: buildC1ReleaseBody(status, visibility),
    });
    const [validationText, validationCheckErr] = await checkResponse(
        validationRes,
        validationReqErr,
        `API release validation failed for ${objectName}`
    );
    if (validationCheckErr) return err(validationCheckErr);

    const messages = parseValidationMessages(validationText);
    const errors = collectErrors(messages);
    if (errors.length > 0) {
        const detail = errors.map(e => e.text).join('; ');
        return err(new Error(`API release validation failed for ${objectName}: ${detail}`));
    }

    return ok(messages);
}

/**
 * Validate, then PUT the C1 contract with the given state and visibility.
 *
 * @returns Resulting state as reported by the PUT response, or error
 */
export async function setApiReleaseState(
    client: AdtRequestor,
    objectName: string,
    status: ApiReleaseStatus,
    transport: string | undefined,
    visibility: ApiReleaseVisibility
): AsyncResult<ApiReleaseResult, Error> {
    const [messages, validationErr] = await validateApiReleaseChange(client, objectName, status, visibility);
    if (validationErr) return err(validationErr);

    const params: Record<string, string> = {};
    if (transport) params['request'] = transport;

    const [putRes, putReqErr] = await client.request({
        method: 'PUT',
        path: buildContractPath(objectName),
        params,
        headers: {
            'Content-Type': APIRELEASE_MEDIA_TYPE,
            'Accept': APIRELEASE_MEDIA_TYPE,
        },
        body: buildC1ReleaseBody(status, visibility),
    });
    const [putText, putCheckErr] = await checkResponse(
        putRes,
        putReqErr,
        `Failed to set API release state for ${objectName}`
    );
    if (putCheckErr) return err(putCheckErr);

    // Confirm the resulting state from the PUT response.
    const [state, parseErr] = parseReleaseState(putText, objectName);
    if (parseErr) return err(parseErr);

    return ok({
        name: state.name,
        status: state.status,
        visibility: state.visibility,
        changed: true,
        messages,
    });
}
