/**
 * Remove From Transport — Remove an object from a transport request
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { extractError } from '../../utils/xml';
import { escapeXml } from '../../utils/xml';

const ACCEPT_HEADER = 'application/vnd.sap.adt.transportorganizer.v1+xml';

/**
 * Object entry to remove from a transport
 */
export interface TransportObject {
    /** Object name (e.g., 'ZSNAP_F72TG_103') */
    name: string;
    /** Object description */
    description: string;
    /** Program ID (e.g., 'R3TR') */
    pgmid: string;
    /** Object type (e.g., 'DDLS') */
    type: string;
    /** Position in the transport (e.g., '000002') */
    position: string;
}

/**
 * Remove an object from a transport request
 *
 * @param client - ADT client
 * @param transportId - Transport request ID (e.g., 'DS4K904588')
 * @param object - Object to remove
 * @returns void on success or error
 */
export async function removeFromTransport(
    client: AdtRequestor,
    transportId: string,
    object: TransportObject
): AsyncResult<void, Error> {
    // Build XML body matching SAP ADT format.
    const body = [
        '<?xml version="1.0" encoding="ASCII"?>',
        `<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:number="${escapeXml(transportId)}" tm:useraction="removeobject">`,
        '  <tm:request>',
        `    <tm:abap_object tm:name="${escapeXml(object.name)}" tm:obj_desc="${escapeXml(object.description)}" tm:pgmid="${escapeXml(object.pgmid)}" tm:type="${escapeXml(object.type)}" tm:position="${escapeXml(object.position)}"/>`,
        '  </tm:request>',
        '</tm:root>',
    ].join('\n');

    const [response, requestErr] = await client.request({
        method: 'PUT',
        path: `/sap/bc/adt/cts/transportrequests/${transportId}`,
        headers: {
            'Accept': ACCEPT_HEADER,
            'Content-Type': 'text/plain',
        },
        body,
    });

    if (requestErr) return err(requestErr);
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Failed to remove ${object.name} from transport ${transportId}: ${errorMsg}`));
    }

    return ok(undefined);
}
