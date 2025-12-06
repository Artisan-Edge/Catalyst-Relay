/**
 * Search Objects — Quick search by name pattern
 */

import { DOMParser } from '@xmldom/xmldom';
import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { SearchResult } from '../../types/responses';
import type { AdtRequestor } from './types';
import { getConfigByType, getAllTypes } from './types';
import { extractError } from '../utils/xml';

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
    const searchPattern = query || '*';
    const objectTypes = types && types.length > 0 ? types : getAllTypes();

    const params: Array<[string, string]> = [
        ['operation', 'quickSearch'],
        ['query', searchPattern],
        ['maxResults', '10001'],
    ];

    for (const type of objectTypes) {
        params.push(['objectType', type]);
    }

    const urlParams = new URLSearchParams();
    for (const [key, value] of params) {
        urlParams.append(key, value);
    }

    const [response, requestErr] = await client.request({
        method: 'GET',
        path: `/sap/bc/adt/repository/informationsystem/search?${urlParams.toString()}`,
    });

    if (requestErr) {
        return err(requestErr);
    }

    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Search failed: ${errorMsg}`));
    }

    const text = await response.text();
    const [results, parseErr] = parseSearchResults(text);
    if (parseErr) {
        return err(parseErr);
    }

    return ok(results);
}

/**
 * Parse search results from XML
 */
function parseSearchResults(xml: string): [SearchResult[], null] | [null, Error] {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');

        const results: SearchResult[] = [];
        const objectRefs = doc.getElementsByTagNameNS('http://www.sap.com/adt/core', 'objectReference');

        for (let i = 0; i < objectRefs.length; i++) {
            const obj = objectRefs[i];
            if (!obj) continue;

            const name = obj.getAttributeNS('http://www.sap.com/adt/core', 'name') || obj.getAttribute('adtcore:name');
            const type = obj.getAttributeNS('http://www.sap.com/adt/core', 'type') || obj.getAttribute('adtcore:type');
            const description = obj.getAttributeNS('http://www.sap.com/adt/core', 'description') || obj.getAttribute('adtcore:description');

            if (!name || !type) {
                continue;
            }

            const config = getConfigByType(type);
            if (!config) {
                continue;
            }

            const packageRef = obj.getElementsByTagNameNS('http://www.sap.com/adt/core', 'packageRef')[0];
            const packageName = packageRef
                ? (packageRef.getAttributeNS('http://www.sap.com/adt/core', 'name') || packageRef.getAttribute('adtcore:name'))
                : '';

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

        return [results, null];
    } catch (error) {
        if (error instanceof Error) {
            return [null, error];
        }
        return [null, new Error('Failed to parse search results')];
    }
}
