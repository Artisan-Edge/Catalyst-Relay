/**
 * Get Transport Targets — list valid transport targets for the system/user.
 *
 * Backs the target value-help that ADT's "Create Transport Request" dialog
 * uses. The result feeds the `tm:target` attribute when creating a request.
 */

import type { Result, AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { extractError, safeParseXml } from '../../utils/xml';

const TARGET_VALUEHELP_PATH = '/sap/bc/adt/cts/transportrequests/valuehelp/target?name=*';
const NAMEDITEM_CONTENT_TYPE = 'application/vnd.sap.adt.nameditems.v1+xml';
const NAMEDITEM_NS = 'http://www.sap.com/adt/nameditem';

export interface TransportTarget {
    name: string;
    description: string;
}

/**
 * Fetch the transport targets available to the current user.
 *
 * @param client - ADT client
 * @returns Array of transport targets or error
 */
export async function getTransportTargets(
    client: AdtRequestor
): AsyncResult<TransportTarget[], Error> {
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: TARGET_VALUEHELP_PATH,
        headers: { Accept: NAMEDITEM_CONTENT_TYPE },
    });

    if (requestErr) return err(requestErr);
    if (!response.ok) {
        const text = await response.text();
        return err(new Error(`Failed to fetch transport targets: ${extractError(text)}`));
    }

    const text = await response.text();
    const [targets, parseErr] = extractTargets(text);
    if (parseErr) return err(parseErr);
    return ok(targets);
}

// Parse <nameditem:namedItem> entries into transport targets.
function extractTargets(xml: string): Result<TransportTarget[], Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const targets: TransportTarget[] = [];
    const items = doc.getElementsByTagNameNS(NAMEDITEM_NS, 'namedItem');

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item) continue;

        const name = item.getElementsByTagNameNS(NAMEDITEM_NS, 'name')[0]?.textContent;
        if (!name || !name.trim()) continue;

        const description = item.getElementsByTagNameNS(NAMEDITEM_NS, 'description')[0]?.textContent;
        targets.push({ name: name.trim(), description: (description ?? '').trim() });
    }

    return ok(targets);
}
