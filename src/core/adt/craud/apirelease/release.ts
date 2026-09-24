/**
 * Release / Unrelease — change the C1 API release state of a CDS DDL source
 *
 * SAP performs the state change in two steps: a validation run (pre-flight,
 * surfaces warnings/errors) followed by the actual PUT. Warnings are
 * non-blocking and returned to the caller; errors abort before the PUT.
 */

import type { AsyncResult } from '../../../../types/result';
import { ok, err } from '../../../../types/result';
import type { AdtRequestor } from '../../types';
import { checkResponse } from '../../helpers';
import type { ApiReleaseResult, ApiReleaseStatus, ApiReleaseVisibility } from './types';
import { getApiReleaseState } from './getState';
import {
    APIRELEASE_MEDIA_TYPE,
    APIRELEASE_VALIDATION_CONTENT_TYPE,
    APIRELEASE_VALIDATION_ACCEPT,
    DEFAULT_C1_VISIBILITY,
    buildC1ReleaseBody,
    buildContractPath,
    buildValidationRunPath,
    collectErrors,
    parseReleaseState,
    parseValidationMessages,
} from './helpers';

/**
 * Release the C1 (customer / SAP Cloud Platform) API contract of a CDS query.
 *
 * @param client - ADT client
 * @param objectName - DDLS object name (e.g. ZSNAP_F04S_Q01)
 * @param transport - Transport request (required for transportable packages)
 * @param visibility - Cloud Development / Key User Apps flags (defaults to both on)
 * @returns Resulting state and any non-blocking validation messages, or error
 */
export async function releaseApi(
    client: AdtRequestor,
    objectName: string,
    transport?: string,
    visibility: ApiReleaseVisibility = DEFAULT_C1_VISIBILITY
): AsyncResult<ApiReleaseResult, Error> {
    if (!visibility.useInCloudDevelopment && !visibility.useInKeyUserApps) {
        return err(new Error('A C1 release needs at least one of Cloud Development or Key User Apps visibility'));
    }
    return setApiReleaseState(client, objectName, 'RELEASED', transport, visibility);
}

/**
 * Unrelease (revert to NOT_RELEASED) the C1 API contract of a CDS query.
 *
 * The object's current visibility flags are read first and sent back unchanged,
 * so an unrelease never alters visibility as a side effect.
 *
 * @param client - ADT client
 * @param objectName - DDLS object name (e.g. ZSNAP_F04S_Q01)
 * @param transport - Transport request (required for transportable packages)
 * @returns Resulting state and any non-blocking validation messages, or error
 */
export async function unreleaseApi(
    client: AdtRequestor,
    objectName: string,
    transport?: string
): AsyncResult<ApiReleaseResult, Error> {
    const [current, stateErr] = await getApiReleaseState(client, objectName);
    if (stateErr) return err(stateErr);

    return setApiReleaseState(client, objectName, 'NOT_RELEASED', transport, current.visibility);
}

// Validation run → (abort on error) → PUT the new state → parse the result.
async function setApiReleaseState(
    client: AdtRequestor,
    objectName: string,
    status: ApiReleaseStatus,
    transport: string | undefined,
    visibility: ApiReleaseVisibility
): AsyncResult<ApiReleaseResult, Error> {
    const body = buildC1ReleaseBody(status, visibility);

    // Step 1: validation run (pre-flight check). The validation endpoint returns
    // its own contract-validation media type; the body remains the apiRelease type.
    const [validationRes, validationReqErr] = await client.request({
        method: 'POST',
        path: buildValidationRunPath(objectName),
        headers: {
            'Content-Type': APIRELEASE_VALIDATION_CONTENT_TYPE,
            'Accept': APIRELEASE_VALIDATION_ACCEPT,
        },
        body,
    });
    const [validationText, validationCheckErr] = await checkResponse(
        validationRes,
        validationReqErr,
        `API release validation failed for ${objectName}`
    );
    if (validationCheckErr) return err(validationCheckErr);

    // Abort before mutating if the validation reported error-severity messages.
    const messages = parseValidationMessages(validationText);
    const errors = collectErrors(messages);
    if (errors.length > 0) {
        const detail = errors.map(e => e.text).join('; ');
        return err(new Error(`API release validation failed for ${objectName}: ${detail}`));
    }

    // Step 2: perform the state change.
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
        body,
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
        messages,
    });
}
