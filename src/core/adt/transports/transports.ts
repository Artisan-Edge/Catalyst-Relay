/**
 * Transports — List transport requests for a package
 */

import type { Result, AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';

/**
 * Transport request
 */
export interface Transport {
    id: string;
    description: string;
    owner: string;
    status: 'modifiable' | 'released';
}

import { extractError, safeParseXml } from '../../utils/xml';

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
    // Build XML request body for transport check.
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

    // Execute transport check request.
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/cts/transportchecks',
        headers: {
            'Accept': contentType,
            'Content-Type': contentType,
        },
        body,
    });

    // Validate successful response.
    if (requestErr) { return err(requestErr); }
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Failed to fetch transports for ${packageName}: ${errorMsg}`));
    }

    // Parse transports from response.
    const text = await response.text();
    const [transports, parseErr] = extractTransports(text);
    if (parseErr) { return err(parseErr); }
    return ok(transports);
}

// Extract transports from XML response.
function extractTransports(xml: string): Result<Transport[], Error> {
    // Parse XML response.
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) { return err(parseErr); }

    // Extract transport headers from response.
    const transports: Transport[] = [];
    const reqHeaders = doc.getElementsByTagName('REQ_HEADER');

    // Process each transport header.
    for (let i = 0; i < reqHeaders.length; i++) {
        const header = reqHeaders[i];
        if (!header) continue;

        // Extract transport metadata elements.
        const trkorrElement = header.getElementsByTagName('TRKORR')[0];
        const userElement = header.getElementsByTagName('AS4USER')[0];
        const textElement = header.getElementsByTagName('AS4TEXT')[0];
        if (!trkorrElement || !userElement || !textElement) continue;

        // Extract text content from elements.
        const id = trkorrElement.textContent;
        const owner = userElement.textContent;
        const description = textElement.textContent;
        if (!id || !owner || !description) continue;

        // Build transport object.
        transports.push({
            id,
            owner,
            description,
            status: 'modifiable',
        });
    }

    return ok(transports);
}
