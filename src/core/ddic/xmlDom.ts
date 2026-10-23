/**
 * XML DOM helpers for the ADT DDIC documents
 */

import { XMLSerializer } from '@xmldom/xmldom';
import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';

export const ADTCORE_NS = 'http://www.sap.com/adt/core';

export function findChild(doc: Document, ns: string, localName: string): Element | null {
    return doc.getElementsByTagNameNS(ns, localName)[0] ?? null;
}

export function requireChild(doc: Document, ns: string, localName: string): Result<Element, Error> {
    const element = findChild(doc, ns, localName);
    if (!element) return err(new Error(`Missing <${localName}> in ADT document`));
    return ok(element);
}

export function childText(doc: Document, ns: string, localName: string): string {
    return findChild(doc, ns, localName)?.textContent ?? '';
}

export function childNumber(doc: Document, ns: string, localName: string): number {
    const value = Number.parseInt(childText(doc, ns, localName), 10);
    return Number.isNaN(value) ? 0 : value;
}

// Replace an element's content with a single text node (or nothing for '').
export function setText(element: Element, value: string): void {
    while (element.firstChild) element.removeChild(element.firstChild);
    if (value !== '') element.appendChild(element.ownerDocument.createTextNode(value));
}

export function setChildText(doc: Document, ns: string, localName: string, value: string): Result<void, Error> {
    const [element, findErr] = requireChild(doc, ns, localName);
    if (findErr) return err(findErr);
    setText(element, value);
    return ok(undefined);
}

// Zero-padded numeric field, e.g. 4 → '000004'.
export function padNumber(value: number, width: number): string {
    return String(value).padStart(width, '0');
}

export function serializeXml(doc: Document): string {
    return new XMLSerializer().serializeToString(doc);
}
