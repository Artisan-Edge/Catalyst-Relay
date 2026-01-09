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
}

import { extractError, safeParseXml } from '../../utils/xml';

/**
 * Get transports for a package
 *
 * Uses the transportchecks endpoint to query available transports
 * for a given package.
 *
 * @param client - ADT client
 * @param packageName - Package name to query transports for
 * @returns Array of transports or error
 */
export async function getTransports(
    client: AdtRequestor,
    packageName: string
): AsyncResult<Transport[], Error> {
    const contentType = 'application/vnd.sap.as+xml; charset=UTF-8; dataname=com.sap.adt.transport.service.checkData';

    // Build XML request body (same format as original SNAP-Relay-API)
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
      <URI>/sap/bc/adt/ddic/ddl/sources/zsnap_test4transports</URI>
    </DATA>
  </asx:values>
</asx:abap>`;

    // Execute transport check request
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/cts/transportchecks',
        headers: {
            'Accept': contentType,
            'Content-Type': contentType,
        },
        body,
    });

    // Validate successful response
    if (requestErr) return err(requestErr);
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Failed to fetch transports for package ${packageName}: ${errorMsg}`));
    }

    // Parse transports from response
    const text = await response.text();

    const [transports, parseErr] = extractTransports(text);
    if (parseErr) return err(parseErr);
    return ok(transports);
}

/**
 * Extract transports from XML response.
 *
 * Response contains REQ_HEADER elements with:
 * - TRKORR: Transport ID
 * - AS4USER: Owner username
 * - AS4TEXT: Description
 */
function extractTransports(xml: string): Result<Transport[], Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const transports: Transport[] = [];
    const reqHeaders = doc.getElementsByTagName('REQ_HEADER');

    for (let i = 0; i < reqHeaders.length; i++) {
        const header = reqHeaders[i];
        if (!header) continue;

        const id = header.getElementsByTagName('TRKORR')[0]?.textContent;
        const owner = header.getElementsByTagName('AS4USER')[0]?.textContent;
        const description = header.getElementsByTagName('AS4TEXT')[0]?.textContent;
        if (!id) continue;

        transports.push({
            id,
            description: description || '',
            owner: owner || '',
        });
    }

    return ok(transports);
}
