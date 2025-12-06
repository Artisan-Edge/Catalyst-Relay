/**
 * Search Objects — Quick search by name pattern
 */

import type { Result, AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { AdtRequestor } from './types';

/**
 * Search result
 */
export interface SearchResult {
    name: string;
    extension: string;
    package: string;
    description?: string;
    objectType: string;
}

import { getConfigByType, getAllTypes } from './types';
import { extractError, safeParseXml } from '../utils/xml';

/**
 * Search for objects by name pattern
 *
 * @param client - ADT client
 * @param query - Search pattern (supports wildcards)
 * @param types - Optional array of object type filters
 * @returns Array of matching objects or error
 */
export async function searchObjects(
    client: AdtRequestor,
    query: string,
    types?: string[]
): AsyncResult<SearchResult[], Error> {
    // Build search parameters.
    const searchPattern = query || '*';
    const objectTypes = types && types.length > 0 ? types : getAllTypes();

    // Construct query parameters (matching Python reference exactly).
    const params: Array<[string, string]> = [
        ['operation', 'quickSearch'],
        ['query', searchPattern],
        ['maxResults', '10001'],
    ];
    for (const type of objectTypes) {
        params.push(['objectType', type]);
    }

    // Build URL search params.
    const urlParams = new URLSearchParams();
    for (const [key, value] of params) {
        urlParams.append(key, value);
    }

    // Execute search request.
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: `/sap/bc/adt/repository/informationsystem/search?${urlParams.toString()}`,
    });

    // Validate successful response.
    if (requestErr) { return err(requestErr); }
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Search failed: ${errorMsg}`));
    }

    // Parse search results from response.
    const text = await response.text();
    const [results, parseErr] = parseSearchResults(text);
    if (parseErr) { return err(parseErr); }
    return ok(results);
}

// Parse search results from XML.
function parseSearchResults(xml: string): Result<SearchResult[], Error> {
    // Parse XML response.
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) { return err(parseErr); }

    // Extract object reference elements.
    const results: SearchResult[] = [];
    const objectRefs = doc.getElementsByTagNameNS('http://www.sap.com/adt/core', 'objectReference');

    // Process each object reference.
    for (let i = 0; i < objectRefs.length; i++) {
        const obj = objectRefs[i];
        if (!obj) continue;

        // Extract object metadata.
        const name = obj.getAttributeNS('http://www.sap.com/adt/core', 'name') || obj.getAttribute('adtcore:name');
        const type = obj.getAttributeNS('http://www.sap.com/adt/core', 'type') || obj.getAttribute('adtcore:type');
        const description = obj.getAttributeNS('http://www.sap.com/adt/core', 'description') || obj.getAttribute('adtcore:description');
        if (!name || !type) continue;

        // Look up object type configuration.
        const config = getConfigByType(type);
        if (!config) continue;

        // Extract package reference if available.
        const packageRef = obj.getElementsByTagNameNS('http://www.sap.com/adt/core', 'packageRef')[0];
        const packageName = packageRef
            ? (packageRef.getAttributeNS('http://www.sap.com/adt/core', 'name') || packageRef.getAttribute('adtcore:name'))
            : '';

        // Build search result object.
        const result: SearchResult = {
            name,
            extension: config.extension,
            package: packageName || '',
            objectType: config.label,
        };
        if (description) {
            result.description = description;
        }
        results.push(result);
    }

    return ok(results);
}
