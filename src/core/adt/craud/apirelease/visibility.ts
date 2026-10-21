/**
 * Visibility — change the Cloud Development / Key User Apps flags of a released C1 contract
 *
 * Narrowing a released contract can be refused by SAP (or be hard to undo), so
 * callers can run SAP's validation alone first with `preview`.
 */

import type { AsyncResult } from '../../../../types/result';
import { ok, err } from '../../../../types/result';
import type { AdtRequestor } from '../../types';
import type { ApiReleaseVisibility, ApiReleaseVisibilityResult } from './types';
import { getApiReleaseState } from './getState';
import { setApiReleaseState, validateApiReleaseChange } from './setState';
import { describeVisibility, isSameVisibility } from './helpers';

/**
 * Options for a visibility update.
 */
export interface ApiReleaseVisibilityOptions {
    /** Transport request (required for transportable packages). */
    transport?: string;
    /** Run SAP's validation only, without applying the change. */
    preview?: boolean;
}

/**
 * Update the visibility of a released C1 contract.
 *
 * Flags left out of `change` keep their current value.
 *
 * @param client - ADT client
 * @param objectName - DDLS object name (e.g. ZSNAP_F04S_Q01)
 * @param change - Flags to set
 * @param options - Transport and preview mode
 * @returns Previous, requested and resulting visibility, or error when the object is not released
 */
export async function updateApiReleaseVisibility(
    client: AdtRequestor,
    objectName: string,
    change: Partial<ApiReleaseVisibility>,
    options: ApiReleaseVisibilityOptions = {}
): AsyncResult<ApiReleaseVisibilityResult, Error> {
    const [current, stateErr] = await getApiReleaseState(client, objectName);
    if (stateErr) return err(stateErr);
    if (current.status !== 'RELEASED') {
        return err(new Error(`${current.name} is not released (${current.status}); release it first`));
    }

    const previous = current.visibility;
    const requested: ApiReleaseVisibility = { ...previous, ...change };
    if (!requested.useInCloudDevelopment && !requested.useInKeyUserApps) {
        return err(new Error('A C1 release needs at least one of Cloud Development or Key User Apps visibility'));
    }

    const base = { name: current.name, previous, requested, preview: options.preview === true };
    if (isSameVisibility(previous, requested)) {
        return ok({ ...base, visibility: previous, changed: false, messages: [{ severity: 'info', text: `Already ${describeVisibility(previous)}` }] });
    }

    if (options.preview) {
        const [messages, validationErr] = await validateApiReleaseChange(client, objectName, 'RELEASED', requested);
        if (validationErr) return err(validationErr);
        return ok({ ...base, visibility: previous, changed: false, messages });
    }

    const [result, setErr] = await setApiReleaseState(client, objectName, 'RELEASED', options.transport, requested);
    if (setErr) return err(setErr);
    return ok({ ...base, visibility: result.visibility, changed: true, messages: result.messages });
}
