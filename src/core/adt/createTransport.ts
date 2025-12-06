/**
 * Create Transport — Create a new transport request for a package
 */

import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { AdtRequestor } from './types';
import { dictToAbapXml, extractError } from '../utils/xml';

/**
 * Configuration for creating a transport
 */
export interface TransportConfig {
    /** Package name (DEVCLASS) */
    package: string;
    /** Transport description/text */
    description: string;
}

/**
 * Create a new transport request
 *
 * @param client - ADT client
 * @param config - Transport configuration
 * @returns Transport ID or error
 */
export async function createTransport(
    client: AdtRequestor,
    config: TransportConfig
): AsyncResult<string, Error> {
    // Build XML request body.
    const body = dictToAbapXml({
        DEVCLASS: config.package,
        REQUEST_TEXT: config.description,
        REF: '',
        OPERATION: 'I',
    });

    // Execute transport creation request.
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/cts/transports',
        headers: {
            'Content-Type': 'application/vnd.sap.as+xml; charset=UTF-8; dataname=com.sap.adt.CreateCorrectionRequest',
            'Accept': 'text/plain',
        },
        body,
    });

    // Validate response.
    if (requestErr) return err(requestErr);
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Failed to create transport for ${config.package}: ${errorMsg}`));
    }

    // Extract transport ID from response.
    const text = await response.text();
    const transportId = text.trim().split('/').pop();

    if (!transportId) {
        return err(new Error('Failed to parse transport ID from response'));
    }

    return ok(transportId);
}
