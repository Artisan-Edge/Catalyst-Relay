/**
 * ChildPackages — Fetch child packages via virtualfolders endpoint
 *
 * Unlike getSubpackages (nodestructure), this returns packages WITH counts and descriptions.
 *
 * Key difference from directly-assigned objects:
 * - Package preselection WITHOUT `..` prefix = child packages
 * - Package preselection WITH `..` prefix = directly assigned objects
 * - hasChildrenOfSameFacet: true = include package facet in facetorder
 */

import type { AsyncResult } from '../../../../types/result';
import { ok, err } from '../../../../types/result';
import type { AdtRequestor } from '../../types';
import { extractError } from '../../../utils/xml';
import type { PackageNode, TreeDiscoveryQuery } from './types';
import { constructTreeBody, parseTreeXml } from './parsers';

/**
 * Fetch child packages for a given package using virtualfolders endpoint.
 *
 * Request format (no .. prefix = child packages):
 * <vfs:preselection facet="package">
 *   <vfs:value>BASIS</vfs:value>
 * </vfs:preselection>
 * <vfs:facetorder>
 *   <vfs:facet>package</vfs:facet>
 *   <vfs:facet>group</vfs:facet>
 *   <vfs:facet>type</vfs:facet>
 * </vfs:facetorder>
 */
export async function fetchChildPackages(
    client: AdtRequestor,
    parentPackage: string
): AsyncResult<PackageNode[], Error> {
    // Build query WITHOUT .. prefix and WITH hasChildrenOfSameFacet: true
    const query: TreeDiscoveryQuery = {
        PACKAGE: {
            name: parentPackage,
            hasChildrenOfSameFacet: true,
        },
    };

    const body = constructTreeBody(query, '*');
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
        return err(new Error(`Failed to fetch child packages: ${errorMsg}`));
    }

    const text = await response.text();
    const [parsed, parseErr] = parseTreeXml(text);
    if (parseErr) return err(parseErr);

    // Filter to PACKAGE facet folders, excluding the parent package itself
    // The response includes a `..{parentPackage}` entry (directly assigned objects)
    // which, after the `..` prefix is stripped, becomes just `{parentPackage}`
    const parentUpper = parentPackage.toUpperCase();
    const packages: PackageNode[] = parsed.folders
        .filter(f => f.facet === 'PACKAGE' && f.name.toUpperCase() !== parentUpper)
        .map(f => {
            const pkg: PackageNode = {
                name: f.name,
                numContents: f.count,
            };
            if (f.description) pkg.description = f.description;
            return pkg;
        });

    return ok(packages);
}
