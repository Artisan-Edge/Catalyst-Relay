/**
 * Get API Release State — read the C1 release contract of a CDS DDL source
 */

import type { AsyncResult } from '../../../../types/result';
import { ok, err } from '../../../../types/result';
import type { AdtRequestor } from '../../types';
import { checkResponse } from '../../helpers';
import type { ApiReleaseState } from './types';
import { APIRELEASE_MEDIA_TYPE, buildApiReleasePath, parseReleaseState } from './helpers';

/**
 * Read the current C1 API release state of a CDS DDL source.
 *
 * @param client - ADT client
 * @param objectName - DDLS object name (e.g. ZSNAP_F04S_Q01)
 * @returns Current release state or error
 */
export async function getApiReleaseState(
    client: AdtRequestor,
    objectName: string
): AsyncResult<ApiReleaseState, Error> {
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: buildApiReleasePath(objectName),
        headers: { 'Accept': APIRELEASE_MEDIA_TYPE },
    });

    const [text, checkErr] = await checkResponse(
        response,
        requestErr,
        `Failed to read API release state for ${objectName}`
    );
    if (checkErr) return err(checkErr);

    const [state, parseErr] = parseReleaseState(text, objectName);
    if (parseErr) return err(parseErr);

    return ok(state);
}
