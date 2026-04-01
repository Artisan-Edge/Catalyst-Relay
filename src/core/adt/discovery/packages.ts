/**
 * Packages — List available packages
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { extractError, safeParseXml } from '../../utils/xml';
import { getPackageStats } from './tree/packageStats';

export interface Package {
    name: string;
    description?: string;
}

/**
 * Get list of available packages
 *
 * Uses the ADT search API with DEVC/K object type to search for packages,
 * then enriches results with descriptions from the virtualfolders API.
 *
 * @param client - ADT client
 * @param filter - Package name filter pattern (default: '*' for all packages)
 *                 Examples: 'Z*' for custom packages, '$TMP' for local, 'ZSNAP*' for specific prefix
 * @returns Array of packages or error
 */
export interface GetPackagesOptions {
    filter?: string;
    includeDescriptions?: boolean;
}

export async function getPackages(
    client: AdtRequestor,
    options: GetPackagesOptions = {}
): AsyncResult<Package[], Error> {
    const { filter = '*', includeDescriptions = false } = options;

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

    // Extract package names from object references.
    const packageNames: string[] = [];
    const objectRefs = doc.getElementsByTagNameNS('http://www.sap.com/adt/core', 'objectReference');

    for (let i = 0; i < objectRefs.length; i++) {
        const obj = objectRefs[i];
        if (!obj) return err(new Error('Invalid object reference in package search results'));

        const name = obj.getAttributeNS('http://www.sap.com/adt/core', 'name') || obj.getAttribute('adtcore:name');
        if (!name) return err(new Error('Package name missing in object reference'));
        packageNames.push(name);
    }

    if (packageNames.length === 0) return ok([]);
    if (!includeDescriptions) return ok(packageNames.map(name => ({ name })));

    // Enrich with descriptions from virtualfolders API (quickSearch doesn't return them).
    const [stats, statsErr] = await getPackageStats(client, packageNames);
    if (statsErr) {
        return ok(packageNames.map(name => ({ name })));
    }

    // Build lookup for descriptions.
    const descriptionMap = new Map<string, string>();
    for (const stat of stats) {
        if (stat.description) descriptionMap.set(stat.name, stat.description);
    }

    // Merge descriptions into results.
    const packages: Package[] = packageNames.map(name => {
        const pkg: Package = { name };
        const description = descriptionMap.get(name);
        if (description) pkg.description = description;
        return pkg;
    });

    return ok(packages);
}
