/**
 * Subpackages — Fetch subpackages via nodestructure endpoint
 */

import type { Result, AsyncResult } from '../../../../types/result';
import { ok, err } from '../../../../types/result';
import type { AdtRequestor } from '../../types';
import { extractError, safeParseXml } from '../../../utils/xml';
import type { PackageNode } from './types';

/**
 * Get subpackages using nodestructure endpoint
 */
export async function getSubpackages(
    client: AdtRequestor,
    packageName: string
): AsyncResult<PackageNode[], Error> {
    const params = new URLSearchParams([
        ['parent_type', 'DEVC/K'],
        ['parent_name', packageName],
        ['withShortDescriptions', 'true'],
    ]);

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: `/sap/bc/adt/repository/nodestructure?${params.toString()}`,
        headers: {
            'Accept': 'application/vnd.sap.as+xml',
        },
    });

    if (requestErr) return err(requestErr);
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Nodestructure failed: ${errorMsg}`));
    }

    const text = await response.text();
    return parseNodestructureForPackages(text, packageName);
}

/**
 * Parse nodestructure response to extract subpackages
 */
function parseNodestructureForPackages(xml: string, parentPackage: string): Result<PackageNode[], Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const packages: PackageNode[] = [];

    const nodes = doc.getElementsByTagName('SEU_ADT_REPOSITORY_OBJ_NODE');
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!node) continue;

        const objectType = node.getElementsByTagName('OBJECT_TYPE')[0]?.textContent?.trim();
        if (objectType !== 'DEVC/K') continue;

        const objectName = node.getElementsByTagName('OBJECT_NAME')[0]?.textContent?.trim();
        if (!objectName) continue;

        // Skip the parent package itself
        if (objectName.toUpperCase() === parentPackage.toUpperCase()) continue;

        const description = node.getElementsByTagName('DESCRIPTION')[0]?.textContent?.trim();

        const pkg: PackageNode = {
            name: objectName,
            numContents: 0, // nodestructure doesn't provide counts
        };
        if (description) pkg.description = description;
        packages.push(pkg);
    }

    return ok(packages);
}
