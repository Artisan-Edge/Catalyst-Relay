/**
 * Check Deletion — ask ADT's generic deletion service whether objects can be deleted
 */

import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { DeletionCheckResult } from './types';
import { escapeXml, safeParseXml } from '../../utils/xml';
import { checkResponse } from '../helpers';
import { CHECK_PATH, DELETION_NS, ADTCORE_NS, objectIdentity, objectMessages, objectsByUri } from './helpers';

const CHECK_CONTENT_TYPE = 'application/vnd.sap.adt.deletion.check.request.v1+xml';

/**
 * Deletion check by object URI (any type, including ones without a lockable URI such as app variants).
 *
 * @param client - ADT client
 * @param uris - ADT object URIs (e.g. /sap/bc/adt/vit/wb/object_type/advclrp/object_name/<NAME>)
 * @returns One result per requested URI (in order; isDeletable false with strong references) or error
 */
export async function checkDeletion(
    client: AdtRequestor,
    uris: string[]
): AsyncResult<DeletionCheckResult[], Error> {
    if (uris.length === 0) return ok([]);
    const objects = uris.map(uri => `<del:object adtcore:uri="${escapeXml(uri)}"/>`).join('');
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<del:checkRequest xmlns:del="${DELETION_NS}" xmlns:adtcore="${ADTCORE_NS}">${objects}</del:checkRequest>`;

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: CHECK_PATH,
        headers: { 'Content-Type': CHECK_CONTENT_TYPE, 'Accept': '*/*' },
        body,
    });
    const [text, checkErr] = await checkResponse(response, requestErr, 'Deletion check failed', CHECK_CONTENT_TYPE);
    if (checkErr) return err(checkErr);
    return parseDeletionCheck(text, uris);
}

/**
 * Parse a deletion check response.
 *
 * @param xml - del:checkResponse
 * @param uris - Requested URIs (each must have a result)
 * @returns One result per requested URI (in order) or error
 */
export function parseDeletionCheck(xml: string, uris: string[]): Result<DeletionCheckResult[], Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);
    const [objects, objectsErr] = objectsByUri(doc, 'checkResponse', uris, 'Deletion check');
    if (objectsErr) return err(objectsErr);

    const results: DeletionCheckResult[] = [];
    for (const element of objects) {
        const locking = element.getElementsByTagNameNS(DELETION_NS, 'lockingTransport')[0];
        const strongReferences = Number(element.getAttributeNS(DELETION_NS, 'externalStrongReferences') || 0);
        results.push({
            ...objectIdentity(element),
            // A strong reference would break the referencing object, whatever SAP says
            isDeletable: element.getAttributeNS(DELETION_NS, 'isDeletable') === 'true' && strongReferences === 0,
            externalStrongReferences: strongReferences,
            externalWeakReferences: Number(element.getAttributeNS(DELETION_NS, 'externalWeakReferences') || 0),
            recording: locking?.getElementsByTagNameNS(DELETION_NS, 'recording')[0]?.textContent?.trim() === 'true',
            lockingTransport: locking?.getElementsByTagNameNS(DELETION_NS, 'trkorr')[0]?.textContent?.trim() ?? '',
            messages: objectMessages(element),
        });
    }
    return ok(results);
}
