/**
 * Get Transport Contents — List all objects on a transport request
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { extractError, safeParseXml } from '../../utils/xml';
import type { TransportObject } from './removeFromTransport';

const ACCEPT_HEADER = 'application/vnd.sap.adt.transportorganizer.v1+xml';

/**
 * Get all objects on a transport request
 *
 * Reads the transport and extracts all tm:abap_object entries
 * from both the request level and any child tasks.
 *
 * @param client - ADT client
 * @param transportId - Transport request ID (e.g., 'DS4K904713')
 * @returns Array of transport objects or error
 */
export async function getTransportContents(
    client: AdtRequestor,
    transportId: string
): AsyncResult<TransportObject[], Error> {
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: `/sap/bc/adt/cts/transportrequests/${transportId}`,
        headers: {
            'Accept': ACCEPT_HEADER,
        },
    });

    if (requestErr) return err(requestErr);
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Failed to read transport ${transportId}: ${errorMsg}`));
    }

    const text = await response.text();
    const [doc, parseErr] = safeParseXml(text);
    if (parseErr) return err(parseErr);

    // Extract all tm:abap_object elements from the response.
    const objects: TransportObject[] = [];
    const elements = doc.getElementsByTagName('tm:abap_object');

    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (!el) continue;

        const name = el.getAttribute('tm:name');
        if (!name) continue;

        objects.push({
            name,
            description: el.getAttribute('tm:obj_desc') || el.getAttribute('tm:obj_info') || '',
            pgmid: el.getAttribute('tm:pgmid') || '',
            type: el.getAttribute('tm:type') || '',
            position: el.getAttribute('tm:position') || '',
        });
    }

    return ok(objects);
}
