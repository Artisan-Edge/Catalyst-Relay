/**
 * Tree — Hierarchical tree browsing for packages
 */

import type { Result, AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { TreeQuery } from '../../types/requests';
import type { AdtRequestor } from './types';
import { getConfigByType } from './types';
import { extractError, safeParseXml } from '../utils/xml';

/**
 * Tree node for hierarchical browsing
 */
export interface TreeNode {
    name: string;
    type: 'folder' | 'object';
    objectType?: string;
    extension?: string;
    hasChildren?: boolean;
    children?: TreeNode[];
}

/**
 * Package info
 */
export interface Package {
    name: string;
    description?: string;
    parentPackage?: string;
}

/**
 * Virtual folder for tree discovery (internal)
 */
interface VirtualFolder {
    name: string;
    hasChildrenOfSameFacet: boolean;
    count?: string;
}

/**
 * Tree discovery internal query (internal)
 */
interface TreeDiscoveryQuery {
    PACKAGE?: VirtualFolder;
    TYPE?: VirtualFolder;
    GROUP?: VirtualFolder;
    API?: VirtualFolder;
}

/**
 * Get hierarchical tree of objects
 *
 * @param client - ADT client
 * @param query - Tree query parameters
 * @returns Tree nodes or error
 */
export async function getTree(
    client: AdtRequestor,
    query: TreeQuery
): AsyncResult<TreeNode[], Error> {
    // Build internal query with package filter.
    const internalQuery: TreeDiscoveryQuery = {};
    if (query.package) {
        internalQuery.PACKAGE = {
            name: query.package.startsWith('..') ? query.package : `..${query.package}`,
            hasChildrenOfSameFacet: false,
        };
    }

    // Execute tree discovery and return nodes.
    const [result, resultErr] = await getTreeInternal(client, internalQuery, '*');
    if (resultErr) { return err(resultErr); }
    return ok(result.nodes);
}

/**
 * Internal tree discovery with full options
 *
 * Exported for use by packages.ts
 */
export async function getTreeInternal(
    client: AdtRequestor,
    query: TreeDiscoveryQuery,
    searchPattern: string
): AsyncResult<{ nodes: TreeNode[]; packages: Package[] }, Error> {
    // Build XML request body.
    const body = constructTreeBody(query, searchPattern);

    // Execute virtual folders request.
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/repository/informationsystem/virtualfolders/contents',
        headers: {
            'Content-Type': 'application/vnd.sap.adt.repository.virtualfolders.request.v1+xml',
            'Accept': 'application/vnd.sap.adt.repository.virtualfolders.result.v1+xml',
        },
        body,
    });

    // Validate successful response.
    if (requestErr) { return err(requestErr); }
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Tree discovery failed: ${errorMsg}`));
    }

    // Parse tree response.
    const text = await response.text();
    const [result, parseErr] = parseTreeResponse(text);
    if (parseErr) { return err(parseErr); }
    return ok(result);
}

// Construct tree discovery request body.
function constructTreeBody(query: TreeDiscoveryQuery, searchPattern: string): string {
    // Determine which facets are specified vs requested.
    const facets: string[] = [];
    const specified: Record<string, string> = {};
    const sortedFacets = ['PACKAGE', 'GROUP', 'TYPE', 'API'];

    for (const facet of sortedFacets) {
        const value = query[facet as keyof TreeDiscoveryQuery];
        if (value) {
            specified[facet] = value.name;
            if (!value.hasChildrenOfSameFacet) {
                facets.push(facet);
            }
        } else {
            facets.push(facet);
        }
    }

    // Build XML elements for specified facets using preselection structure.
    const specifiedXml = Object.entries(specified)
        .map(([facet, name]) => `  <vfs:preselection facet="${facet.toLowerCase()}">
    <vfs:value>${name}</vfs:value>
  </vfs:preselection>`)
        .join('\n');

    // Build XML elements for requested facets (lowercase).
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

// Parse tree discovery response.
function parseTreeResponse(xml: string): Result<{ nodes: TreeNode[]; packages: Package[] }, Error> {
    // Parse XML response.
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) { return err(parseErr); }

    const nodes: TreeNode[] = [];
    const packages: Package[] = [];

    // Process virtual folder elements (packages, groups, etc).
    const virtualFolders = doc.getElementsByTagName('vfs:virtualFolder');
    for (let i = 0; i < virtualFolders.length; i++) {
        const vf = virtualFolders[i];
        if (!vf) continue;

        const facet = vf.getAttribute('facet');
        const name = vf.getAttribute('name');

        // Extract package metadata if this is a package facet.
        if (facet === 'PACKAGE' && name) {
            const desc = vf.getAttribute('description');
            const pkg: Package = {
                name: name.startsWith('..') ? name.substring(2) : name,
            };
            if (desc) {
                pkg.description = desc;
            }
            packages.push(pkg);
        }

        if (!name || !facet) continue;

        // Add folder node (strip '..' prefix from name).
        nodes.push({
            name: name.startsWith('..') ? name.substring(2) : name,
            type: 'folder',
            hasChildren: vf.getAttribute('hasChildrenOfSameFacet') === 'true',
        });
    }

    // Process object elements (actual ADT objects).
    const objects = doc.getElementsByTagName('vfs:object');
    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        if (!obj) continue;

        const name = obj.getAttribute('name');
        const type = obj.getAttribute('type');
        if (!name || !type) continue;

        // Look up object type configuration.
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
