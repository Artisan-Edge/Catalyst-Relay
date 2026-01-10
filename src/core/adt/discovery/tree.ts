/**
 * Tree — Hierarchical tree browsing for packages
 */

import type { Result, AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { TreeQuery } from '../../../types/requests';
import type { AdtRequestor } from '../types';
import { getConfigByType } from '../types';
import { extractError, safeParseXml } from '../../utils/xml';

// Public response types

export interface TreeResponse {
    packages: PackageNode[];
    folders: FolderNode[];
    objects: ObjectNode[];
}

export interface PackageNode {
    name: string;
    description?: string;
    numContents: number;
}

export interface FolderNode {
    name: string;
    displayName: string;
    numContents: number;
}

export interface ObjectNode {
    name: string;
    objectType: string;
    extension: string;
}

// Legacy types (kept for packages.ts compatibility)

export interface TreeNode {
    name: string;
    type: 'folder' | 'object';
    objectType?: string;
    extension?: string;
    hasChildren?: boolean;
}

export interface Package {
    name: string;
    description?: string;
    parentPackage?: string;
}

// Internal types

interface VirtualFolder {
    name: string;
    hasChildrenOfSameFacet: boolean;
}

interface TreeDiscoveryQuery {
    PACKAGE?: VirtualFolder;
    TYPE?: VirtualFolder;
    GROUP?: VirtualFolder;
    API?: VirtualFolder;
}

interface ParsedFolder {
    facet: 'PACKAGE' | 'GROUP' | 'TYPE' | 'API';
    name: string;
    displayName: string;
    description?: string;
    count: number;
}

interface ParsedObject {
    name: string;
    objectType: string;
    extension: string;
}

interface ParseResult {
    folders: ParsedFolder[];
    objects: ParsedObject[];
}

/**
 * Get hierarchical tree contents for a package
 */
export async function getTree(
    client: AdtRequestor,
    query: TreeQuery
): AsyncResult<TreeResponse, Error> {
    // If no path specified, fetch subpackages via nodestructure.
    // Otherwise, just get folder contents via virtualfolders.
    let packages: PackageNode[] = [];

    if (!query.path) {
        const [subpkgs, subErr] = await getSubpackages(client, query.package);
        if (subErr) return err(subErr);
        packages = subpkgs;
    }

    // Build internal query from path segments.
    const internalQuery = buildQueryFromPath(query.package, query.path);

    // Execute virtualfolders for folders/objects.
    const body = constructTreeBody(internalQuery, '*');
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
        return err(new Error(`Tree discovery failed: ${errorMsg}`));
    }

    const text = await response.text();
    const [parsed, parseErr] = parseTreeXml(text);
    if (parseErr) return err(parseErr);

    const result = transformToTreeResponse(parsed, query.package);

    // Merge in subpackages from nodestructure.
    result.packages = packages;

    return ok(result);
}

/**
 * Get subpackages using nodestructure endpoint
 */
async function getSubpackages(
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

    // Find all SEU_ADT_REPOSITORY_OBJ_NODE elements
    const nodes = doc.getElementsByTagName('SEU_ADT_REPOSITORY_OBJ_NODE');
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!node) continue;

        // Check if it's a package (DEVC/K)
        const objectType = node.getElementsByTagName('OBJECT_TYPE')[0]?.textContent?.trim();
        if (objectType !== 'DEVC/K') continue;

        // Get package name
        const objectName = node.getElementsByTagName('OBJECT_NAME')[0]?.textContent?.trim();
        if (!objectName) continue;

        // Skip the parent package itself
        if (objectName.toUpperCase() === parentPackage.toUpperCase()) continue;

        // Get description
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

/**
 * Internal tree discovery with full options (for packages.ts)
 */
export async function getTreeInternal(
    client: AdtRequestor,
    query: TreeDiscoveryQuery,
    searchPattern: string
): AsyncResult<{ nodes: TreeNode[]; packages: Package[] }, Error> {
    const body = constructTreeBody(query, searchPattern);

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
        return err(new Error(`Tree discovery failed: ${errorMsg}`));
    }

    const text = await response.text();
    return parseTreeResponseLegacy(text);
}

// Build query from package and path.
function buildQueryFromPath(packageName: string, path?: string): TreeDiscoveryQuery {
    const query: TreeDiscoveryQuery = {
        PACKAGE: {
            name: packageName.startsWith('..') ? packageName : `..${packageName}`,
            hasChildrenOfSameFacet: false, // Don't include PACKAGE in facetorder - we want contents, not the package itself
        },
    };

    if (!path) return query;

    // Split path into segments (e.g., "CORE_DATA_SERVICES/DATA_DEFINITIONS")
    const segments = path.split('/').filter(s => s.length > 0);

    // First segment = GROUP
    if (segments[0]) {
        query.GROUP = {
            name: segments[0],
            hasChildrenOfSameFacet: false,
        };
    }

    // Second segment = TYPE
    if (segments[1]) {
        query.TYPE = {
            name: segments[1],
            hasChildrenOfSameFacet: false,
        };
    }

    return query;
}

// Construct tree discovery request body.
function constructTreeBody(query: TreeDiscoveryQuery, searchPattern: string): string {
    const facets: string[] = [];
    const specified: Record<string, string> = {};
    const sortedFacets = ['PACKAGE', 'GROUP', 'TYPE', 'API'];

    for (const facet of sortedFacets) {
        const value = query[facet as keyof TreeDiscoveryQuery];
        if (value) {
            specified[facet] = value.name;
            if (value.hasChildrenOfSameFacet) {
                facets.push(facet);
            }
        } else {
            facets.push(facet);
        }
    }

    const specifiedXml = Object.entries(specified)
        .map(([facet, name]) => `  <vfs:preselection facet="${facet.toLowerCase()}">
    <vfs:value>${name}</vfs:value>
  </vfs:preselection>`)
        .join('\n');

    const facetsXml = facets
        .map(facet => `    <vfs:facet>${facet.toLowerCase()}</vfs:facet>`)
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<vfs:virtualFoldersRequest xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectSearchPattern="${searchPattern}">
${specifiedXml}
  <vfs:facetorder>
${facetsXml}
  </vfs:facetorder>
</vfs:virtualFoldersRequest>`;
}

// Parse tree XML into structured data.
function parseTreeXml(xml: string): Result<ParseResult, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const folders: ParsedFolder[] = [];
    const objects: ParsedObject[] = [];

    // Process virtual folder elements.
    const virtualFolders = doc.getElementsByTagName('vfs:virtualFolder');
    for (let i = 0; i < virtualFolders.length; i++) {
        const vf = virtualFolders[i];
        if (!vf) continue;

        const facet = vf.getAttribute('facet')?.toUpperCase();
        const name = vf.getAttribute('name');
        if (!name || !facet) continue;

        const validFacets = ['PACKAGE', 'GROUP', 'TYPE', 'API'] as const;
        if (!validFacets.includes(facet as typeof validFacets[number])) continue;

        const countAttr = vf.getAttribute('counter');
        const count = countAttr ? parseInt(countAttr, 10) : 0;
        const desc = vf.getAttribute('description');
        const displayNameAttr = vf.getAttribute('displayName');

        // Technical name (strip .. prefix)
        const technicalName = name.startsWith('..') ? name.substring(2) : name;
        // Display name (use displayName attr if available, otherwise technical name)
        const displayName = displayNameAttr || technicalName;

        const parsedFolder: ParsedFolder = {
            facet: facet as 'PACKAGE' | 'GROUP' | 'TYPE' | 'API',
            name: technicalName,
            displayName,
            count,
        };
        if (desc) parsedFolder.description = desc;
        folders.push(parsedFolder);
    }

    // Process object elements.
    const objectElements = doc.getElementsByTagName('vfs:object');
    for (let i = 0; i < objectElements.length; i++) {
        const obj = objectElements[i];
        if (!obj) continue;

        const name = obj.getAttribute('name');
        const type = obj.getAttribute('type');
        if (!name || !type) continue;

        const config = getConfigByType(type);
        if (!config) continue;

        objects.push({
            name,
            objectType: config.label,
            extension: config.extension,
        });
    }

    return ok({ folders, objects });
}

// Transform parsed data to TreeResponse.
function transformToTreeResponse(parsed: ParseResult, queryPackage: string): TreeResponse {
    const packages: PackageNode[] = [];
    const folders: FolderNode[] = [];

    for (const folder of parsed.folders) {
        // Skip the queried package itself.
        if (folder.facet === 'PACKAGE' && folder.name === queryPackage) continue;

        if (folder.facet === 'PACKAGE') {
            const pkg: PackageNode = {
                name: folder.name,
                numContents: folder.count,
            };
            if (folder.description) pkg.description = folder.description;
            packages.push(pkg);
        } else {
            folders.push({
                name: folder.name,
                displayName: folder.displayName,
                numContents: folder.count,
            });
        }
    }

    const objects: ObjectNode[] = parsed.objects.map(obj => ({
        name: obj.name,
        objectType: obj.objectType,
        extension: obj.extension,
    }));

    return { packages, folders, objects };
}

// Legacy parser for getTreeInternal (packages.ts compatibility).
function parseTreeResponseLegacy(xml: string): Result<{ nodes: TreeNode[]; packages: Package[] }, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const nodes: TreeNode[] = [];
    const packages: Package[] = [];

    const virtualFolders = doc.getElementsByTagName('vfs:virtualFolder');
    for (let i = 0; i < virtualFolders.length; i++) {
        const vf = virtualFolders[i];
        if (!vf) continue;

        const facet = vf.getAttribute('facet');
        const name = vf.getAttribute('name');

        if (facet === 'PACKAGE' && name) {
            const desc = vf.getAttribute('description');
            const pkg: Package = {
                name: name.startsWith('..') ? name.substring(2) : name,
            };
            if (desc) pkg.description = desc;
            packages.push(pkg);
        }

        if (!name || !facet) continue;

        nodes.push({
            name: name.startsWith('..') ? name.substring(2) : name,
            type: 'folder',
            hasChildren: vf.getAttribute('hasChildrenOfSameFacet') === 'true',
        });
    }

    const objectElements = doc.getElementsByTagName('vfs:object');
    for (let i = 0; i < objectElements.length; i++) {
        const obj = objectElements[i];
        if (!obj) continue;

        const name = obj.getAttribute('name');
        const type = obj.getAttribute('type');
        if (!name || !type) continue;

        const config = getConfigByType(type);
        if (!config) continue;

        nodes.push({
            name,
            type: 'object',
            objectType: config.label,
            extension: config.extension,
        });
    }

    return ok({ nodes, packages });
}
