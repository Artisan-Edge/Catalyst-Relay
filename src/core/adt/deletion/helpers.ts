/**
 * Deletion service helpers — namespaces and per-object parsing (internal)
 */

import type { Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { DeletionMessage } from './types';

export const DELETION_NS = 'http://www.sap.com/adt/deletion';
export const ADTCORE_NS = 'http://www.sap.com/adt/core';
export const CHECK_PATH = '/sap/bc/adt/deletion/check';
export const DELETE_PATH = '/sap/bc/adt/deletion/delete';

/**
 * The <del:object> elements of a deletion response, checked: the root must be the expected one and
 * every requested URI must have its own result.
 *
 * @param doc - Parsed response
 * @param rootName - checkResponse or deletionResult
 * @param uris - Requested URIs
 * @param what - Error context
 * @returns The object element per requested URI (in request order), or error
 */
export function objectsByUri(doc: Document, rootName: string, uris: string[], what: string): Result<Element[], Error> {
    const root = doc.documentElement;
    if (!root || root.namespaceURI !== DELETION_NS || root.localName !== rootName) {
        return err(new Error(`${what}: unexpected response (root ${root?.localName ?? 'none'}, expected ${rootName})`));
    }
    const byUri = new Map<string, Element>();
    const objects = doc.getElementsByTagNameNS(DELETION_NS, 'object');
    for (let i = 0; i < objects.length; i++) {
        const element = objects[i];
        if (!element) continue;
        byUri.set(normalizeUri(element.getAttributeNS(ADTCORE_NS, 'uri') ?? ''), element);
    }
    const elements: Element[] = [];
    for (const uri of uris) {
        const element = byUri.get(normalizeUri(uri));
        if (!element) return err(new Error(`${what}: no result for ${uri} (${objects.length} result(s) for ${uris.length} object(s))`));
        elements.push(element);
    }
    return ok(elements);
}

// URIs compare case-insensitively, with or without percent-encoding
function normalizeUri(uri: string): string {
    try {
        return decodeURIComponent(uri).toLowerCase();
    } catch {
        return uri.toLowerCase();
    }
}

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
