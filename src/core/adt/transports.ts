/**
 * Transports — List transport requests for a package
 */

import { DOMParser } from '@xmldom/xmldom';
import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { Transport } from '../../types/responses';
import type { AdtRequestor } from './types';
import { extractError } from '../utils/xml';

/**
 * Get transports for a package
 *
 * @param client - ADT client
 * @param packageName - Package name
 * @returns Array of transports or error
 */
export async function getTransports(
    client: AdtRequestor,
    packageName: string
): AsyncResult<Transport[], Error> {
    const contentType = 'application/vnd.sap.as+xml; charset=UTF-8; dataname=com.sap.adt.transport.service.checkData';

    const body = `<?xml version="1.0" encoding="UTF-8"?>
                    <asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml">
                    <asx:values>
                        <DATA>
                        <PGMID></PGMID>
                        <OBJECT></OBJECT>
                        <OBJECTNAME></OBJECTNAME>
                        <DEVCLASS>${packageName}</DEVCLASS>
                        <SUPER_PACKAGE></SUPER_PACKAGE>
                        <OPERATION>I</OPERATION>
                        <URI>/sap/bc/adt/ddic/ddl/sources/transport_check</URI>
                        </DATA>
                    </asx:values>
                    </asx:abap>`;

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/cts/transportchecks',
        headers: {
            'Accept': contentType,
            'Content-Type': contentType,
        },
        body,
    });

    if (requestErr) {
        return err(requestErr);
    }

    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Failed to fetch transports for ${packageName}: ${errorMsg}`));
    }

    const text = await response.text();
    const [transports, parseErr] = extractTransports(text);
    if (parseErr) {
        return err(parseErr);
    }

    return ok(transports);
}

/**
 * Extract transports from XML response
 */
function extractTransports(xml: string): [Transport[], null] | [null, Error] {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');

        const transports: Transport[] = [];
        const reqHeaders = doc.getElementsByTagName('REQ_HEADER');

        for (let i = 0; i < reqHeaders.length; i++) {
            const header = reqHeaders[i];
            if (!header) continue;

            const trkorrElement = header.getElementsByTagName('TRKORR')[0];
            const userElement = header.getElementsByTagName('AS4USER')[0];
            const textElement = header.getElementsByTagName('AS4TEXT')[0];

            if (!trkorrElement || !userElement || !textElement) {
                continue;
            }

            const id = trkorrElement.textContent;
            const owner = userElement.textContent;
            const description = textElement.textContent;

            if (!id || !owner || !description) {
                continue;
            }

            transports.push({
                id,
                owner,
                description,
                status: 'modifiable',
            });
        }

        return [transports, null];
    } catch (error) {
        if (error instanceof Error) {
            return [null, error];
        }
        return [null, new Error('Failed to parse transports')];
    }
}
