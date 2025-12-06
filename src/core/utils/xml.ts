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
 * Securely parse XML string into a Document object (throws on error)
 *
 * @param xmlString - The XML string to parse
 * @returns Parsed XML Document
 * @throws Error if XML is malformed
 * @deprecated Use safeParseXml for Result-based error handling
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
 * Safely parse XML string into a Document object
 *
 * @param xmlString - The XML string to parse
 * @returns Result tuple with Document or Error
 */
export function safeParseXml(xmlString: string): Result<Document, Error> {
    // Validate input.
    if (!xmlString || xmlString.trim().length === 0) {
        return err(new Error('Empty XML string provided'));
    }

    try {
        // Parse XML string.
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlString, 'text/xml');

        // Check for parser errors.
        const parseError = doc.getElementsByTagName('parsererror');
        if (parseError.length > 0) {
            const errorNode = parseError[0];
            const errorText = errorNode?.textContent || 'Unknown XML parsing error';
            return err(new Error(`XML parsing failed: ${errorText}`));
        }

        return ok(doc);
    } catch (error) {
        if (error instanceof Error) {
            return err(error);
        }
        return err(new Error('Unknown XML parsing error'));
    }
}

/**
 * Extract LOCK_HANDLE from ADT XML response
 *
 * @param xml - XML string containing lock handle
 * @returns Result tuple with lock handle or error
 */
export function extractLockHandle(xml: string): Result<string, Error> {
    // Validate input.
    if (!xml) {
        return err(new Error('Empty XML provided'));
    }

    // Parse XML response.
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) { return err(parseErr); }

    // Find LOCK_HANDLE element.
    const lockHandleElements = doc.getElementsByTagName('LOCK_HANDLE');
    if (lockHandleElements.length === 0) {
        return err(new Error('LOCK_HANDLE element not found in XML'));
    }

    // Extract and validate lock handle value.
    const lockHandleElement = lockHandleElements[0];
    const lockHandle = lockHandleElement?.textContent;
    if (!lockHandle || lockHandle.trim().length === 0) {
        return err(new Error('LOCK_HANDLE element is empty'));
    }

    return ok(lockHandle.trim());
}

/**
 * Extract error message from ADT XML error response
 *
 * @param xml - XML string containing error message
 * @returns Error message or default message
 */
export function extractError(xml: string): string {
    // Handle empty input.
    if (!xml) {
        return 'No error message found';
    }

    // Parse XML response.
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) {
        return 'Failed to parse error XML';
    }

    // Find message element.
    const messageElements = doc.getElementsByTagName('message');
    if (messageElements.length === 0) {
        return 'No message found';
    }

    // Extract message text.
    const messageElement = messageElements[0];
    const message = messageElement?.textContent;
    return message || 'No message found';
}

/**
 * Escape special XML characters
 *
 * @param str - String to escape
 * @returns XML-safe string
 */
export function escapeXml(str: string): string {
    // Handle empty input.
    if (!str) {
        return '';
    }

    // Replace special XML characters with entities.
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
    // Build inner XML elements from key-value pairs.
    const innerElements = Object.entries(data)
        .map(([key, value]) => {
            if (value) {
                return `<${key}>${escapeXml(value)}</${key}>`;
            }
            return `<${key}/>`;
        })
        .join('\n            ');

    // Return complete ABAP XML structure.
    return `<?xml version="1.0" encoding="UTF-8"?>
<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
    <asx:values>
        <${root}>
            ${innerElements}
        </${root}>
    </asx:values>
</asx:abap>`;
}
