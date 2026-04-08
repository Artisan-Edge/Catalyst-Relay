/**
 * Inactive Objects — Query inactive (unsaved) objects from SAP ADT
 *
 * Calls GET /sap/bc/adt/activation/inactiveobjects to retrieve objects
 * and transports that have inactive versions pending activation.
 */

import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { extractError, safeParseXml } from '../../utils/xml';

const IOC_NS = 'http://www.sap.com/abapxml/inactiveCtsObjects';
const ADTCORE_NS = 'http://www.sap.com/adt/core';

/**
 * Reference to an inactive object or transport
 */
export interface InactiveRef {
    uri: string;
    type: string;
    name: string;
    description?: string;
}

/**
 * An inactive object entry (object with unsaved changes)
 */
export interface InactiveObject {
    user: string;
    deleted: boolean;
    ref: InactiveRef;
}

/**
 * An inactive transport entry (transport containing inactive objects)
 */
export interface InactiveTransport {
    user: string;
    linked: boolean;
    ref: InactiveRef;
}

/**
 * A single entry from the inactive objects response.
 * Each entry has either an object, a transport, or both.
 */
export interface InactiveEntry {
    object?: InactiveObject;
    transport?: InactiveTransport;
}

/**
 * Get all inactive objects from the SAP system
 *
 * Queries the ADT activation endpoint for objects and transports
 * that have inactive (unsaved/unactivated) versions.
 *
 * @param client - ADT requestor
 * @returns Array of inactive entries or error
 */
export async function getInactiveObjects(
    client: AdtRequestor
): AsyncResult<InactiveEntry[], Error> {
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: '/sap/bc/adt/activation/inactiveobjects',
        headers: {
            'Accept': 'application/vnd.sap.adt.inactivectsobjects.v1+xml, application/xml;q=0.8',
        },
    });

    if (requestErr) return err(requestErr);
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Failed to fetch inactive objects: ${errorMsg}`));
    }

    const text = await response.text();
    return parseInactiveObjects(text);
}

/**
 * Parse the inactive objects XML response into structured entries.
 */
function parseInactiveObjects(xml: string): Result<InactiveEntry[], Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const entries: InactiveEntry[] = [];
    const entryElements = doc.getElementsByTagNameNS(IOC_NS, 'entry');

    for (let i = 0; i < entryElements.length; i++) {
        const entryEl = entryElements[i];
        if (!entryEl) continue;

        const entry: InactiveEntry = {};

        // Parse object element
        const objectEls = entryEl.getElementsByTagNameNS(IOC_NS, 'object');
        if (objectEls.length > 0) {
            const objectEl = objectEls[0]!;
            const objectRef = extractRef(objectEl);
            if (objectRef) {
                const user = objectEl.getAttributeNS(IOC_NS, 'user') || objectEl.getAttribute('ioc:user') || '';
                const deletedStr = objectEl.getAttributeNS(IOC_NS, 'deleted') || objectEl.getAttribute('ioc:deleted') || 'false';
                entry.object = {
                    user,
                    deleted: deletedStr === 'true',
                    ref: objectRef,
                };
            }
        }

        // Parse transport element
        const transportEls = entryEl.getElementsByTagNameNS(IOC_NS, 'transport');
        if (transportEls.length > 0) {
            const transportEl = transportEls[0]!;
            const transportRef = extractRef(transportEl);
            if (transportRef) {
                const user = transportEl.getAttributeNS(IOC_NS, 'user') || transportEl.getAttribute('ioc:user') || '';
                const linkedStr = transportEl.getAttributeNS(IOC_NS, 'linked') || transportEl.getAttribute('ioc:linked') || 'false';
                entry.transport = {
                    user,
                    linked: linkedStr === 'true',
                    ref: transportRef,
                };
            }
        }

        // Only add entries that have at least one populated side
        if (entry.object || entry.transport) {
            entries.push(entry);
        }
    }

    return ok(entries);
}

/**
 * Extract an InactiveRef from an ioc:ref child element, if present.
 */
function extractRef(parent: Element): InactiveRef | null {
    const refs = parent.getElementsByTagNameNS(IOC_NS, 'ref');
    if (refs.length === 0) return null;

    const ref = refs[0]!;
    const uri = ref.getAttributeNS(ADTCORE_NS, 'uri') || ref.getAttribute('adtcore:uri') || '';
    const type = ref.getAttributeNS(ADTCORE_NS, 'type') || ref.getAttribute('adtcore:type') || '';
    const name = ref.getAttributeNS(ADTCORE_NS, 'name') || ref.getAttribute('adtcore:name') || '';
    const description = ref.getAttributeNS(ADTCORE_NS, 'description') || ref.getAttribute('adtcore:description') || undefined;

    if (!uri && !name) return null;

    const result: InactiveRef = { uri, type, name };
    if (description) result.description = description;
    return result;
}
