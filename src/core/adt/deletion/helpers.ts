/**
 * Deletion service helpers — namespaces and per-object parsing (internal)
 */

import type { DeletionMessage } from './types';

export const DELETION_NS = 'http://www.sap.com/adt/deletion';
export const ADTCORE_NS = 'http://www.sap.com/adt/core';
export const CHECK_PATH = '/sap/bc/adt/deletion/check';
export const DELETE_PATH = '/sap/bc/adt/deletion/delete';

/** The adtcore identity attributes of a <del:object> */
export function objectIdentity(element: Element): { uri: string; name: string; type: string; packageName: string } {
    return {
        uri: element.getAttributeNS(ADTCORE_NS, 'uri') ?? '',
        name: element.getAttributeNS(ADTCORE_NS, 'name') ?? '',
        type: element.getAttributeNS(ADTCORE_NS, 'type') ?? '',
        packageName: element.getAttributeNS(ADTCORE_NS, 'packageName') ?? '',
    };
}

/** Messages under a <del:object> with a text (SAP sends an empty S message on success) */
export function objectMessages(element: Element): DeletionMessage[] {
    const messages: DeletionMessage[] = [];
    const entries = element.getElementsByTagNameNS(DELETION_NS, 'message');
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!entry) continue;
        const text = entry.getElementsByTagNameNS(DELETION_NS, 'text')[0]?.textContent?.trim() ?? '';
        if (!text) continue;
        messages.push({ type: entry.getAttributeNS(DELETION_NS, 'type') ?? '', text });
    }
    return messages;
}
