/**
 * Release / Unrelease — change the C1 API release state of a CDS DDL source
 *
 * Both are no-ops when the object is already in the target state, so a re-run
 * never rewrites a live contract. Visibility of a released object is changed
 * with updateApiReleaseVisibility instead.
 */

import type { AsyncResult } from '../../../../types/result';
import { ok, err } from '../../../../types/result';
import type { AdtRequestor } from '../../types';
import type { ApiReleaseResult, ApiReleaseStatus, ApiReleaseVisibility } from './types';
import { getApiReleaseState } from './getState';
import { setApiReleaseState } from './setState';
import { DEFAULT_C1_VISIBILITY, describeVisibility, isSameVisibility } from './helpers';

/**
 * Release the C1 (customer / SAP Cloud Platform) API contract of a CDS query.
 *
 * An object that is already released is left as it is.
 *
 * @param client - ADT client
 * @param objectName - DDLS object name (e.g. ZSNAP_F04S_Q01)
 * @param transport - Transport request (required for transportable packages)
 * @param visibility - Cloud Development / Key User Apps flags (defaults to Cloud Development only)
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

    const [current, stateErr] = await getApiReleaseState(client, objectName);
    if (stateErr) return err(stateErr);

    if (current.status === 'RELEASED') {
        const text = isSameVisibility(current.visibility, visibility)
            ? `Already released with ${describeVisibility(current.visibility)}`
            : `Already released with ${describeVisibility(current.visibility)}; requested ${describeVisibility(visibility)} was not applied (change it with a visibility update)`;
        return ok(unchangedResult(current.name, current.status, current.visibility, text));
    }

    return setApiReleaseState(client, objectName, 'RELEASED', transport, visibility);
}

/**
 * Unrelease (revert to NOT_RELEASED) the C1 API contract of a CDS query.
 *
 * The object's current visibility flags are sent back unchanged, so an
 * unrelease never alters visibility as a side effect.
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

    if (current.status === 'NOT_RELEASED') {
        return ok(unchangedResult(current.name, current.status, current.visibility, 'Already not released'));
    }

    return setApiReleaseState(client, objectName, 'NOT_RELEASED', transport, current.visibility);
}

// Result for a call that found the object already in the target state; nothing was sent.
function unchangedResult(name: string, status: ApiReleaseStatus, visibility: ApiReleaseVisibility, text: string): ApiReleaseResult {
    return { name, status, visibility, changed: false, messages: [{ severity: 'info', text }] };
}
