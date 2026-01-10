/**
 * PackageStats — Get stats for a specific package
 *
 * Uses virtualfolders endpoint to get recursive object count:
 * 1. POST /sap/bc/adt/repository/informationsystem/virtualfolders with package preselection
 * 2. Parse objectCount attribute from response (recursive count including subpackages)
 * 3. GET /sap/bc/adt/packages/{name} for description
 */

import type { AsyncResult } from '../../../../types/result';
import { ok, err } from '../../../../types/result';
import type { AdtRequestor } from '../../types';
import type { PackageNode } from './types';
import { extractError, safeParseXml } from '../../../utils/xml';

interface PackageMetadata {
    name: string;
    description?: string;
}

/**
 * Fetch package metadata (name, description) from /sap/bc/adt/packages/{name}
 */
async function fetchPackageMetadata(
    client: AdtRequestor,
    packageName: string
): AsyncResult<PackageMetadata, Error> {
    const [response, requestErr] = await client.request({
        method: 'GET',
        path: `/sap/bc/adt/packages/${packageName.toLowerCase()}`,
        headers: {
            'Accept': 'application/vnd.sap.adt.packages.v1+xml',
        },
    });

    if (requestErr) return err(requestErr);
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Package metadata fetch failed: ${errorMsg}`));
    }

    const xml = await response.text();
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    // Extract name and description from pak:package element
    const packageElements = doc.getElementsByTagName('pak:package');
    if (packageElements.length === 0) {
        return err(new Error(`Package ${packageName} not found`));
    }

    const pkgEl = packageElements[0]!;
    const name = pkgEl.getAttribute('adtcore:name') ||
                 pkgEl.getAttributeNS('http://www.sap.com/adt/core', 'name') ||
                 packageName.toUpperCase();
    const description = pkgEl.getAttribute('adtcore:description') ||
                        pkgEl.getAttributeNS('http://www.sap.com/adt/core', 'description');

    const result: PackageMetadata = { name };
    if (description) result.description = description;

    return ok(result);
}

/**
 * Construct virtualfolders request body for package count query
 */
function constructCountRequestBody(packageName: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<vfs:virtualFoldersRequest xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectSearchPattern="*">
  <vfs:preselection facet="package">
    <vfs:value>${packageName}</vfs:value>
  </vfs:preselection>
  <vfs:facetorder/>
</vfs:virtualFoldersRequest>`;
}

/**
 * Fetch recursive content count for a package using virtualfolders endpoint.
 * Returns the objectCount attribute which includes all objects in subpackages.
 */
async function fetchContentCount(
    client: AdtRequestor,
    packageName: string
): AsyncResult<number, Error> {
    const body = constructCountRequestBody(packageName);

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/repository/informationsystem/virtualfolders',
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
        return err(new Error(`Package count fetch failed: ${errorMsg}`));
    }

    const xml = await response.text();
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    // Parse objectCount from the root element
    const resultElements = doc.getElementsByTagName('vfs:virtualFoldersResult');
    if (resultElements.length === 0) {
        return err(new Error('Invalid virtualfolders response: missing result element'));
    }

    const resultEl = resultElements[0]!;
    const objectCountAttr = resultEl.getAttribute('objectCount');

    if (!objectCountAttr) {
        return err(new Error('Invalid virtualfolders response: missing objectCount attribute'));
    }

    const count = parseInt(objectCountAttr, 10);
    if (isNaN(count)) {
        return err(new Error(`Invalid objectCount value: ${objectCountAttr}`));
    }

    return ok(count);
}

/**
 * Get stats for a specific package (name, description, numContents).
 *
 * Uses virtualfolders endpoint to get recursive object count,
 * and package metadata endpoint for description.
 */
export async function getPackageStats(
    client: AdtRequestor,
    packageName: string
): AsyncResult<PackageNode, Error> {
    // Fetch metadata and content count in parallel
    const [metadataResult, countResult] = await Promise.all([
        fetchPackageMetadata(client, packageName),
        fetchContentCount(client, packageName),
    ]);

    const [metadata, metaErr] = metadataResult;
    if (metaErr) return err(metaErr);

    const [numContents, countErr] = countResult;
    if (countErr) return err(countErr);

    const result: PackageNode = {
        name: metadata.name,
        numContents,
    };
    if (metadata.description) result.description = metadata.description;

    return ok(result);
}
