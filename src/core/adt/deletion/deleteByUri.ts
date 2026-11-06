/**
 * Delete By URI — delete objects through ADT's generic deletion service (no lock needed)
 */

import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { DeletionResult } from './types';
import { escapeXml, safeParseXml } from '../../utils/xml';
import { checkResponse } from '../helpers';
import { DELETE_PATH, DELETION_NS, ADTCORE_NS, objectIdentity, objectMessages, objectsByUri } from './helpers';

const DELETE_CONTENT_TYPE = 'application/vnd.sap.adt.deletion.request.v1+xml';

/**
 * Delete objects by URI through /deletion/delete; for types whose URI cannot be locked (app variants).
 *
 * @param client - ADT client
 * @param uris - ADT object URIs
 * @param transport - Transport request (packages that record changes)
 * @returns One result per object (isDeleted false carries SAP's messages) or error
 */
export async function deleteByUri(
    client: AdtRequestor,
    uris: string[],
    transport?: string
): AsyncResult<DeletionResult[], Error> {
    if (uris.length === 0) return ok([]);
    const transportNumber = transport ? `<del:transportNumber>${escapeXml(transport)}</del:transportNumber>` : '<del:transportNumber/>';
    const objects = uris.map(uri => `<del:object adtcore:uri="${escapeXml(uri)}">${transportNumber}</del:object>`).join('');
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<del:deletionRequest xmlns:del="${DELETION_NS}" xmlns:adtcore="${ADTCORE_NS}">${objects}</del:deletionRequest>`;

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: DELETE_PATH,
        headers: { 'Content-Type': DELETE_CONTENT_TYPE, 'Accept': '*/*' },
        body,
    });
    const [text, checkErr] = await checkResponse(response, requestErr, 'Deletion failed', DELETE_CONTENT_TYPE);
    if (checkErr) return err(checkErr);
    return parseDeletionResult(text, uris);
}

/**
 * Parse a deletion response.
 *
 * @param xml - del:deletionResult
 * @param uris - Requested URIs (each must have a result)
 * @returns One result per requested URI (in order) or error
 */
export function parseDeletionResult(xml: string, uris: string[]): Result<DeletionResult[], Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);
    const [objects, objectsErr] = objectsByUri(doc, 'deletionResult', uris, 'Deletion');
    if (objectsErr) return err(objectsErr);

    const results: DeletionResult[] = [];
    for (const element of objects) {
        results.push({
            ...objectIdentity(element),
            isDeleted: element.getAttributeNS(DELETION_NS, 'isDeleted') === 'true',
            messages: objectMessages(element),
        });
    }
    return ok(results);
}
