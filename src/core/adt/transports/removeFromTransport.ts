/**
 * Remove From Transport — Remove an object from a transport request
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { extractError, escapeXml, safeParseXml } from '../../utils/xml';
import { parseTransportTasks } from './parseTransportTasks';

const ACCEPT_HEADER = 'application/vnd.sap.adt.transportorganizer.v1+xml';

/**
 * Object entry on a transport
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
 * Remove a specific object entry from a transport (internal helper).
 * Requires full object details — used by deleteTransport and removeFromTransport.
 */
export async function removeTransportEntry(
    client: AdtRequestor,
    transportId: string,
    object: TransportObject
): AsyncResult<void, Error> {
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

/**
 * Remove an object from a transport by name.
 * Reads the transport XML, finds which task the object lives on, and removes it
 * using the task ID (not the request ID).
 */
export async function removeFromTransport(
    client: AdtRequestor,
    transportId: string,
    objectName: string
): AsyncResult<void, Error> {
    // Fetch transport XML to get the task hierarchy.
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: `/sap/bc/adt/cts/transportrequests/${transportId}`,
        headers: { 'Accept': ACCEPT_HEADER },
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

    // Find which task contains the object.
    const tasks = parseTransportTasks(doc);
    for (const task of tasks) {
        const object = task.objects.find(o => o.name === objectName);
        if (!object) continue;

        return removeTransportEntry(client, task.taskId, object);
    }

    return err(new Error(`Object '${objectName}' not found on transport ${transportId}`));
}
