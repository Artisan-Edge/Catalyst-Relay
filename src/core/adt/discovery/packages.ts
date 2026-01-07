/**
 * Packages — List available packages
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { Package } from './tree';
import { extractError, safeParseXml } from '../../utils/xml';

/**
 * Get list of available packages
 *
 * Uses the ADT search API with DEVC/K object type to search for packages.
 *
 * @param client - ADT client
 * @param filter - Package name filter pattern (default: '*' for all packages)
 *                 Examples: 'Z*' for custom packages, '$TMP' for local, 'ZSNAP*' for specific prefix
 * @returns Array of packages or error
 */
export async function getPackages(
    client: AdtRequestor,
    filter = '*'
): AsyncResult<Package[], Error> {
    // Build search parameters for package search.
    const params = new URLSearchParams([
        ['operation', 'quickSearch'],
        ['query', filter],
        ['maxResults', '10001'],
        ['objectType', 'DEVC/K'],
    ]);

    // Execute search request.
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: `/sap/bc/adt/repository/informationsystem/search?${params.toString()}`,
    });

    // Validate successful response.
    if (requestErr) { return err(requestErr); }
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Package search failed: ${errorMsg}`));
    }

    // Parse search results.
    const text = await response.text();
    const [doc, parseErr] = safeParseXml(text);
    if (parseErr) { return err(parseErr); }

    // Extract packages from object references.
    const packages: Package[] = [];
    const objectRefs = doc.getElementsByTagNameNS('http://www.sap.com/adt/core', 'objectReference');

    for (let i = 0; i < objectRefs.length; i++) {
        // Confirm that packages work as expected.
        const obj = objectRefs[i];
        if (!obj) return err(new Error('Invalid object reference in package search results'));

        // Extract package name and description.
        const name = obj.getAttributeNS('http://www.sap.com/adt/core', 'name') || obj.getAttribute('adtcore:name');
        const description = obj.getAttributeNS('http://www.sap.com/adt/core', 'description') || obj.getAttribute('adtcore:description');
        if (!name) return err(new Error('Package name missing in object reference'));

        // Convert into Package object.
        const pkg: Package = { name };
        if (description) pkg.description = description;
        packages.push(pkg);
    }

    return ok(packages);
}
