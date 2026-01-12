/**
 * PackageStats — Get stats for specific packages
 *
 * Uses virtualfolders/contents endpoint with package names in preselection:
 * - counter attribute = recursive object count (includes subpackages)
 * - text attribute = package description
 */

import type { AsyncResult } from '../../../../types/result';
import { ok, err } from '../../../../types/result';
import type { AdtRequestor } from '../../types';
import type { PackageNode } from './types';
import { extractError, safeParseXml } from '../../../utils/xml';

/**
 * Construct request body for fetching specific packages by name.
 *
 * SAP quirk: With only 1 package in preselection, SAP drills INTO that package.
 * With 2+ packages, it returns those packages as top-level results.
 * We add an empty value when only 1 package is requested to get the correct behavior.
 */
function constructPackageStatsBody(packageNames: string[]): string {
    // Ensure at least 2 values - SAP needs 2+ to return packages as results
    // SRIS_TEST_DATA_VFS_EMPTY is a known empty SAP package that won't add noise
    const names = packageNames.length === 1
        ? [...packageNames, 'SRIS_TEST_DATA_VFS_EMPTY']
        : packageNames;

    const values = names
        .map(name => `    <vfs:value>${name}</vfs:value>`)
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<vfs:virtualFoldersRequest xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectSearchPattern="*">
  <vfs:preselection facet="package">
${values}
  </vfs:preselection>
  <vfs:facetorder>
    <vfs:facet>package</vfs:facet>
    <vfs:facet>group</vfs:facet>
    <vfs:facet>type</vfs:facet>
  </vfs:facetorder>
</vfs:virtualFoldersRequest>`;
}

/**
 * Parse package stats from virtualfolders response.
 */
function parsePackageStats(xml: string): PackageNode[] {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return [];

    const packages: PackageNode[] = [];
    const virtualFolders = doc.getElementsByTagName('vfs:virtualFolder');

    for (let i = 0; i < virtualFolders.length; i++) {
        const vf = virtualFolders[i];
        if (!vf) continue;

        const facet = vf.getAttribute('facet')?.toUpperCase();
        if (facet !== 'PACKAGE') continue;

        const name = vf.getAttribute('name');
        if (!name) continue;

        const countAttr = vf.getAttribute('counter');
        const count = countAttr ? parseInt(countAttr, 10) : 0;
        const description = vf.getAttribute('text');

        const pkg: PackageNode = {
            name,
            numContents: count,
        };
        if (description) pkg.description = description;
        packages.push(pkg);
    }

    return packages;
}

/**
 * Get stats for a single package.
 */
export async function getPackageStats(
    client: AdtRequestor,
    packageName: string
): AsyncResult<PackageNode, Error>;

/**
 * Get stats for multiple packages.
 */
export async function getPackageStats(
    client: AdtRequestor,
    packageNames: string[]
): AsyncResult<PackageNode[], Error>;

/**
 * Get stats for one or more packages (name, description, numContents).
 *
 * Efficiently fetches only the requested packages by putting their names
 * in the preselection, rather than fetching all packages.
 */
export async function getPackageStats(
    client: AdtRequestor,
    packageNames: string | string[]
): AsyncResult<PackageNode | PackageNode[], Error> {
    const isSingle = typeof packageNames === 'string';
    const names = isSingle ? [packageNames] : packageNames;
    if (names.length === 0) {
        return ok([]);
    }

    const body = constructPackageStatsBody(names);

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/repository/informationsystem/virtualfolders/contents',
        headers: {
            'Content-Type': 'application/vnd.sap.adt.repository.virtualfolders.request.v1+xml',
            'Accept': 'application/vnd.sap.adt.repository.virtualfolders.result.v1+xml',
        },
        body,
    });

    if (requestErr) return err(requestErr);
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Package stats fetch failed: ${errorMsg}`));
    }

    const xml = await response.text();
    const packages = parsePackageStats(xml)
        .filter(pkg => pkg.name !== 'SRIS_TEST_DATA_VFS_EMPTY');

    // Match the return type to the input type.
    if (isSingle) {
        if (packages.length === 0) {
            return err(new Error(`Package ${packageNames} not found`));
        }
        return ok(packages[0]!);
    }
    return ok(packages);
}
