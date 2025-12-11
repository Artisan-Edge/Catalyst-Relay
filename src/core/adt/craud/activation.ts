// ADT Activation — activate ADT objects

import type { Result, AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor } from '../types';
import { getConfigByExtension } from '../types';
import { extractError, safeParseXml } from '../../utils/xml';
import { debug } from '../../utils/logging';

/**
 * Result of activation operation
 */
export interface ActivationResult {
    name: string;
    extension: string;
    status: 'success' | 'warning' | 'error';
    messages: ActivationMessage[];
}

export interface ActivationMessage {
    severity: 'error' | 'warning' | 'info';
    text: string;
    line?: number;
    column?: number;
}

export async function activateObjects(
    client: AdtRequestor,
    objects: ObjectRef[]
): AsyncResult<ActivationResult[], Error> {
    // Handle empty input.
    if (objects.length === 0) {
        return ok([]);
    }

    // Validate object extension is supported.
    const extension = objects[0]!.extension;
    const config = getConfigByExtension(extension);
    if (!config) return err(new Error(`Unsupported extension: ${extension}`));

    // Verify all objects have same extension for batch activation.
    for (const obj of objects) {
        if (obj.extension !== extension) {
            return err(new Error('All objects must have the same extension for batch activation'));
        }
    }

    // Build XML request body with object references.
    const objectRefs = objects.map(obj => `<adtcore:objectReference
                adtcore:uri="/sap/bc/adt/${config.endpoint}/${obj.name.toLowerCase()}"
                adtcore:type="${config.type}"
                adtcore:name="${obj.name}"
                adtcore:description="*"/>`).join('\n            ');

    const body = `<?xml version="1.0" encoding="UTF-8"?>
            <adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
            ${objectRefs}
            </adtcore:objectReferences>`;

    // Execute activation request.
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/activation',
        params: {
            'method': 'activate',
            'preAuditRequested': 'true',
        },
        headers: {
            'Content-Type': 'application/xml',
            'Accept': 'application/xml',
        },
        body,
    });

    // Validate successful response.
    if (requestErr) { return err(requestErr); }
    const text = await response.text();
    debug(`Activation response status: ${response.status}`);
    debug(`Activation response: ${text.substring(0, 500)}`);
    if (!response.ok) {
        const errorMsg = extractError(text);
        return err(new Error(`Activation failed: ${errorMsg}`));
    }

    // Parse activation results from response.
    const [results, parseErr] = extractActivationErrors(objects, text, extension);
    if (parseErr) { return err(parseErr); }
    return ok(results);
}

// Parse activation response XML for errors
function extractActivationErrors(
    objects: ObjectRef[],
    xml: string,
    _extension: string
): Result<ActivationResult[], Error> {
    // Parse XML response.
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) { return err(parseErr); }

    // Initialize error map with empty arrays for each object.
    const errorMap: Map<string, ActivationMessage[]> = new Map();
    objects.forEach(obj => errorMap.set(obj.name.toLowerCase(), []));

    // Extract message elements and prepare regex for position parsing.
    const msgElements = doc.getElementsByTagName('msg');
    const startRegex = /#start=(\d+),(\d+)/;

    // Process each message element.
    for (let i = 0; i < msgElements.length; i++) {
        const msg = msgElements[i];
        if (!msg) continue;

        // Skip warning messages (type 'W').
        const type = msg.getAttribute('type');
        if (type === 'W') continue;

        // Extract object description and href for position info.
        const objDescr = msg.getAttribute('objDescr');
        const href = msg.getAttribute('href');
        if (!objDescr || !href) continue;

        // Parse line and column from href.
        let line: number | undefined;
        let column: number | undefined;
        const match = startRegex.exec(href);
        if (match && match[1] && match[2]) {
            line = parseInt(match[1], 10);
            column = parseInt(match[2], 10);
        }
        if (!line || !column) continue;

        // Find matching object by name.
        const matchingObj = objects.find(obj =>
            objDescr.toLowerCase().includes(obj.name.toLowerCase())
        );
        if (!matchingObj) continue;

        // Extract message text elements.
        const shortTextElements = msg.getElementsByTagName('txt');
        for (let j = 0; j < shortTextElements.length; j++) {
            const txt = shortTextElements[j];
            if (!txt) continue;

            const text = txt.textContent;
            if (!text) continue;

            // Build activation message with severity and position.
            const message: ActivationMessage = {
                severity: type === 'E' ? 'error' : 'warning',
                text,
                line,
                column,
            };

            // Add message to object's error list.
            const messages = errorMap.get(matchingObj.name.toLowerCase()) || [];
            messages.push(message);
            errorMap.set(matchingObj.name.toLowerCase(), messages);
        }
    }

    // Build final results with status based on message severity.
    const results: ActivationResult[] = objects.map(obj => {
        const messages = errorMap.get(obj.name.toLowerCase()) || [];
        const hasErrors = messages.some(m => m.severity === 'error');

        return {
            name: obj.name,
            extension: obj.extension,
            status: hasErrors ? 'error' : messages.length > 0 ? 'warning' : 'success',
            messages,
        };
    });

    return ok(results);
}
