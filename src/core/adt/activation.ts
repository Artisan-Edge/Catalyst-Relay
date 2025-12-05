// ADT Activation — activate ADT objects

import { DOMParser } from '@xmldom/xmldom';
import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { ObjectRef } from '../../types/requests';
import type { ActivationResult, ActivationMessage } from '../../types/responses';
import type { AdtRequestor } from './types';
import { getConfigByExtension } from './types';
import { extractError } from '../utils/xml';

export async function activateObjects(
    client: AdtRequestor,
    objects: ObjectRef[]
): AsyncResult<ActivationResult[], Error> {
    if (objects.length === 0) {
        return ok([]);
    }

    const extension = objects[0]!.extension;
    const config = getConfigByExtension(extension);
    if (!config) return err(new Error(`Unsupported extension: ${extension}`));

    // Verify all objects have same extension
    for (const obj of objects) {
        if (obj.extension !== extension) {
            return err(new Error('All objects must have the same extension for batch activation'));
        }
    }

    const objectRefs = objects.map(obj => `<adtcore:objectReference
                adtcore:uri="/sap/bc/adt/${config.endpoint}/${obj.name.toLowerCase()}"
                adtcore:type="${config.type}"
                adtcore:name="${obj.name}"
                adtcore:description="*"/>`).join('\n            ');

    const body = `<?xml version="1.0" encoding="UTF-8"?>
            <adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
            ${objectRefs}
            </adtcore:objectReferences>`;

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

    if (requestErr) {
        return err(requestErr);
    }

    const text = await response.text();

    if (!response.ok) {
        const errorMsg = extractError(text);
        return err(new Error(`Activation failed: ${errorMsg}`));
    }

    const [results, parseErr] = extractActivationErrors(objects, text, extension);
    if (parseErr) {
        return err(parseErr);
    }

    return ok(results);
}

// Parse activation response XML for errors
function extractActivationErrors(
    objects: ObjectRef[],
    xml: string,
    extension: string
): [ActivationResult[], null] | [null, Error] {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');

        const errorMap: Map<string, ActivationMessage[]> = new Map();
        objects.forEach(obj => errorMap.set(obj.name.toLowerCase(), []));

        const msgElements = doc.getElementsByTagName('msg');
        const startRegex = /#start=(\d+),(\d+)/;

        for (let i = 0; i < msgElements.length; i++) {
            const msg = msgElements[i];
            if (!msg) continue;

            const type = msg.getAttribute('type');

            if (type === 'W') {
                continue;
            }

            const objDescr = msg.getAttribute('objDescr');
            const href = msg.getAttribute('href');

            if (!objDescr || !href) {
                continue;
            }

            let line: number | undefined;
            let column: number | undefined;

            const match = startRegex.exec(href);
            if (match && match[1] && match[2]) {
                line = parseInt(match[1], 10);
                column = parseInt(match[2], 10);
            }

            if (!line || !column) {
                continue;
            }

            const matchingObj = objects.find(obj =>
                objDescr.toLowerCase().includes(obj.name.toLowerCase())
            );

            if (!matchingObj) {
                continue;
            }

            const shortTextElements = msg.getElementsByTagName('txt');
            for (let j = 0; j < shortTextElements.length; j++) {
                const txt = shortTextElements[j];
                if (!txt) continue;

                const text = txt.textContent;

                if (text) {
                    const message: ActivationMessage = {
                        severity: type === 'E' ? 'error' : 'warning',
                        text,
                        line,
                        column,
                    };

                    const messages = errorMap.get(matchingObj.name.toLowerCase()) || [];
                    messages.push(message);
                    errorMap.set(matchingObj.name.toLowerCase(), messages);
                }
            }
        }

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

        return [results, null];
    } catch (error) {
        if (error instanceof Error) {
            return [null, error];
        }
        return [null, new Error('Failed to parse activation response')];
    }
}
