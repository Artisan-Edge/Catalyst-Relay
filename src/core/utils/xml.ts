/**
 * XML Parsing Utilities
 *
 * Secure XML parsing and manipulation for ADT responses.
 * Uses @xmldom/xmldom for cross-platform XML parsing.
 */

import { DOMParser } from '@xmldom/xmldom';
import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';

/**
 * Securely parse XML string into a Document object
 *
 * @param xmlString - The XML string to parse
 * @returns Parsed XML Document
 * @throws Error if XML is malformed
 */
export function parseXml(xmlString: string): Document {
    if (!xmlString || xmlString.trim().length === 0) {
        throw new Error('Empty XML string provided');
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');

    // Check for parser errors
    const parseError = doc.getElementsByTagName('parsererror');
    if (parseError.length > 0) {
        const errorNode = parseError[0];
        const errorText = errorNode?.textContent || 'Unknown XML parsing error';
        throw new Error(`XML parsing failed: ${errorText}`);
    }

    return doc;
}

/**
 * Extract LOCK_HANDLE from ADT XML response
 *
 * @param xml - XML string containing lock handle
 * @returns Result tuple with lock handle or error
 */
export function extractLockHandle(xml: string): Result<string, Error> {
    if (!xml) {
        return err(new Error('Empty XML provided'));
    }

    try {
        const doc = parseXml(xml);
        const lockHandleElements = doc.getElementsByTagName('LOCK_HANDLE');

        if (lockHandleElements.length === 0) {
            return err(new Error('LOCK_HANDLE element not found in XML'));
        }

        const lockHandleElement = lockHandleElements[0];
        const lockHandle = lockHandleElement?.textContent;
        if (!lockHandle || lockHandle.trim().length === 0) {
            return err(new Error('LOCK_HANDLE element is empty'));
        }

        return ok(lockHandle.trim());
    } catch (error) {
        if (error instanceof Error) {
            return err(error);
        }
        return err(new Error('Unknown error extracting lock handle'));
    }
}

/**
 * Extract error message from ADT XML error response
 *
 * @param xml - XML string containing error message
 * @returns Error message or default message
 */
export function extractError(xml: string): string {
    if (!xml) {
        return 'No error message found';
    }

    try {
        const doc = parseXml(xml);
        const messageElements = doc.getElementsByTagName('message');

        if (messageElements.length === 0) {
            return 'No message found';
        }

        const messageElement = messageElements[0];
        const message = messageElement?.textContent;
        return message || 'No message found';
    } catch {
        return 'Failed to parse error XML';
    }
}

/**
 * Escape special XML characters
 *
 * @param str - String to escape
 * @returns XML-safe string
 */
export function escapeXml(str: string): string {
    if (!str) {
        return '';
    }

    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Convert a dictionary to ABAP-style XML
 *
 * This creates XML in the format expected by SAP ADT endpoints:
 * <?xml version="1.0" encoding="UTF-8"?>
 * <asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
 *     <asx:values>
 *         <DATA>
 *             <KEY>value</KEY>
 *         </DATA>
 *     </asx:values>
 * </asx:abap>
 *
 * @param data - Key-value pairs to convert to XML
 * @param root - Root element name (default: "DATA")
 * @returns ABAP-formatted XML string
 */
export function dictToAbapXml(data: Record<string, string>, root: string = 'DATA'): string {
    const innerElements = Object.entries(data)
        .map(([key, value]) => {
            if (value) {
                return `<${key}>${escapeXml(value)}</${key}>`;
            }
            return `<${key}/>`;
        })
        .join('\n            ');

    return `<?xml version="1.0" encoding="UTF-8"?>
<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
    <asx:values>
        <${root}>
            ${innerElements}
        </${root}>
    </asx:values>
</asx:abap>`;
}
