/**
 * Create Transport — create a new transport request.
 *
 * Uses the transport-organizer endpoint, which allows choosing the request
 * type (Workbench vs Customizing). The target is taken from the caller, or
 * resolved from the target value-help when unambiguous.
 */

import type { Result, AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { escapeXml, safeParseXml, extractError } from '../../utils/xml';
import { getTransportTargets } from './getTransportTargets';

const TRANSPORTREQUESTS_PATH = '/sap/bc/adt/cts/transportrequests';
const TM_CONTENT_TYPE = 'application/vnd.sap.adt.transportorganizer.v1+xml';
const TM_NS = 'http://www.sap.com/cts/adt/tm';

// SAP request-type codes (TRFUNCTION).
const TRANSPORT_TYPE_CODES = {
    workbench: 'K',
    customizing: 'W',
} as const;

export type TransportType = keyof typeof TRANSPORT_TYPE_CODES;

export interface TransportConfig {
    /** Transport description/text */
    description: string;
    /** Request type — 'workbench' (default) or 'customizing' */
    type?: TransportType;
    /** Transport target. If omitted, resolved from the value-help (fails when ambiguous). */
    target?: string;
}

/**
 * Create a new transport request.
 *
 * @param client - ADT client
 * @param config - Transport configuration
 * @param owner - Owner username for the request task (the logged-in user)
 * @returns Transport ID or error
 */
export async function createTransport(
    client: AdtRequestor,
    config: TransportConfig,
    owner: string
): AsyncResult<string, Error> {
    // Resolve the transport target.
    const [target, targetErr] = await resolveTarget(client, config.target);
    if (targetErr) return err(targetErr);

    const typeCode = TRANSPORT_TYPE_CODES[config.type ?? 'workbench'];

    // Build the transport-organizer XML request body.
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<tm:root xmlns:tm="${TM_NS}" tm:useraction="newrequest">
  <tm:request tm:desc="${escapeXml(config.description)}" tm:type="${typeCode}" tm:target="${escapeXml(target)}" tm:cts_project="">
    <tm:task tm:owner="${escapeXml(owner)}"/>
  </tm:request>
</tm:root>`;

    // Execute transport creation request.
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: TRANSPORTREQUESTS_PATH,
        headers: {
            'Content-Type': TM_CONTENT_TYPE,
            'Accept': TM_CONTENT_TYPE,
        },
        body,
    });

    // Validate response.
    if (requestErr) return err(requestErr);
    if (!response.ok) {
        const text = await response.text();
        return err(new Error(`Failed to create transport: ${extractError(text)}`));
    }

    // Extract transport ID from response.
    const text = await response.text();
    return extractTransportNumber(text);
}

// Use the explicit target if given; otherwise resolve from the value-help.
async function resolveTarget(
    client: AdtRequestor,
    explicit?: string
): AsyncResult<string, Error> {
    if (explicit) return ok(explicit);

    const [targets, targetsErr] = await getTransportTargets(client);
    if (targetsErr) return err(targetsErr);

    if (targets.length === 0) {
        return err(new Error('No transport targets available; pass an explicit target.'));
    }
    if (targets.length === 1) {
        return ok(targets[0]!.name);
    }

    const options = targets.map(t => `${t.name} (${t.description})`).join(', ');
    return err(new Error(
        `Multiple transport targets available; pass an explicit target. Options: ${options}`
    ));
}

// Read the tm:number attribute from the created tm:request element.
function extractTransportNumber(xml: string): Result<string, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const request = doc.getElementsByTagNameNS(TM_NS, 'request')[0];
    if (!request) return err(new Error('Failed to parse transport number from response'));

    const number = request.getAttributeNS(TM_NS, 'number') || request.getAttribute('tm:number');
    if (!number || !number.trim()) {
        return err(new Error('Failed to parse transport number from response'));
    }

    return ok(number.trim());
}
