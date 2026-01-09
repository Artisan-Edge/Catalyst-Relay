/**
 * Tree — Hierarchical tree browsing for packages
 *
 * Implements the same logic as the Python SNAP-Relay-API:
 * - hasChildrenOfSameFacet controls whether a facet goes in facetorder
 * - Recursive merge when hasChildrenOfSameFacet=true to get both same-facet children AND other facet types
 */

import type { Result, AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { getConfigByType } from '../types';
import { extractError, safeParseXml } from '../../utils/xml';

// ============================================================================
// Types
// ============================================================================

/**
 * Virtual folder in tree discovery
 */
export interface VirtualFolder {
    name: string;
    hasChildrenOfSameFacet: boolean;
    count?: number;
}

/**
 * Tree discovery query - matches Python TreeDiscoveryQuery
 */
export interface TreeDiscoveryQuery {
    PACKAGE?: VirtualFolder;
    TYPE?: VirtualFolder;
    GROUP?: VirtualFolder;
    API?: VirtualFolder;
}

/**
 * Tree node for hierarchical browsing
 */
export interface TreeNode {
    name: string;
    type: 'folder' | 'object';
    facet?: string;
    objectType?: string;
    extension?: string;
    hasChildren?: boolean;
    count?: number;
}

/**
 * Package info
 */
export interface Package {
    name: string;
    description?: string;
}

/**
 * Internal response structure matching Python TreeDiscoveryResponse
 */
interface TreeDiscoveryResponse {
    virtualFolders: Partial<Record<string, VirtualFolder[]>>;
    objects: Array<{ name: string; type: string }>;
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Get hierarchical tree of objects
 *
 * @param client - ADT client
 * @param query - Tree discovery query with facets
 * @returns Tree nodes or error
 */
export async function getTree(
    client: AdtRequestor,
    query: TreeDiscoveryQuery
): AsyncResult<TreeNode[], Error> {
    console.log('\n========== getTree called ==========');
    console.log('Input query:', JSON.stringify(query, null, 2));

    const [response, error] = await treeDiscovery(client, query, '*');
    if (error) return err(error);

    // Convert response to TreeNode array
    const nodes = convertToTreeNodes(response);
    console.log(`Returning ${nodes.length} nodes`);
    return ok(nodes);
}

/**
 * Tree discovery with recursive merge for hasChildrenOfSameFacet
 *
 * Matches Python tree_discovery function behavior:
 * 1. Make initial request
 * 2. If any facet has hasChildrenOfSameFacet=true:
 *    a. Filter out parent markers from that facet's results
 *    b. Make recursive call with hasChildrenOfSameFacet=false to get other facet types
 *    c. Merge results
 */
async function treeDiscovery(
    client: AdtRequestor,
    query: TreeDiscoveryQuery,
    searchPattern: string,
    depth: number = 1
): AsyncResult<TreeDiscoveryResponse, Error> {
    // Build request body
    const body = constructBody(query, searchPattern);

    console.log(`\n----- Request Body (depth=${depth}) -----`);
    console.log(body);
    console.log('------------------------\n');

    // Identify facets with hasChildrenOfSameFacet=true (need recursive merge)
    const recursiveFacets: Record<string, string> = {};
    for (const [facet, value] of Object.entries(query)) {
        if (value && value.hasChildrenOfSameFacet) {
            recursiveFacets[facet] = value.name;
        }
    }

    // Make request
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
        console.log('Error response:', text);
        return err(new Error(`Tree discovery failed: ${extractError(text)}`));
    }

    const text = await response.text();
    console.log(`\n----- Response Body (depth=${depth}) -----`);
    console.log(text);
    console.log('-------------------------\n');

    // Parse response
    const [parsedOutput, parseErr] = extractForTree(text);
    if (parseErr) return err(parseErr);
    let output = parsedOutput;

    // If no recursive facets, we're done
    if (Object.keys(recursiveFacets).length === 0) {
        console.log('No recursive facets, returning directly');
        return ok(output);
    }

    // Recursive merge for each facet with hasChildrenOfSameFacet=true
    let i = 0;
    for (const [facet, name] of Object.entries(recursiveFacets)) {
        console.log(`\nRecursive merge for ${facet}=${name}`);

        // Filter out parent marker from this facet's results
        // Parent marker has ".." + name format (e.g., querying "ZSNAP" returns "..ZSNAP" as parent marker)
        const folders = output.virtualFolders[facet];
        if (folders) {
            output.virtualFolders[facet] = folders.filter(entry => entry.name !== '..' + name);
            console.log(`Filtered out parent marker ..${name}, remaining: ${output.virtualFolders[facet]?.length || 0} folders`);
        }

        // Make recursive call with hasChildrenOfSameFacet=false to get other facet types
        const recursiveQuery: TreeDiscoveryQuery = {
            [facet]: {
                name,
                hasChildrenOfSameFacet: false,
            },
        };

        const [recursiveOutput, recursiveErr] = await treeDiscovery(
            client,
            recursiveQuery,
            searchPattern,
            depth + 1
        );

        if (recursiveErr) return err(recursiveErr);

        // Merge results
        output = mergeOutputs(output, recursiveOutput);
        i++;
    }

    return ok(output);
}

// ============================================================================
// Request Construction
// ============================================================================

const SORTED_FACETS = ['PACKAGE', 'GROUP', 'TYPE', 'API'] as const;

/**
 * Construct XML request body - matches Python construct_body
 */
function constructBody(query: TreeDiscoveryQuery, searchPattern: string): string {
    const { specified, facets } = specifiedVsFacets(query);

    // Build preselection XML for specified facets
    const preselectionXml = Object.entries(specified)
        .map(([facet, name]) => `  <vfs:preselection facet="${facet.toLowerCase()}">
    <vfs:value>${name}</vfs:value>
  </vfs:preselection>`)
        .join('\n');

    // Build facetorder XML
    const facetsXml = facets
        .map(f => `    <vfs:facet>${f.toLowerCase()}</vfs:facet>`)
        .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<vfs:virtualFoldersRequest xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectSearchPattern="${searchPattern}">
${preselectionXml}
  <vfs:facetorder>
${facetsXml}
  </vfs:facetorder>
</vfs:virtualFoldersRequest>`;
}

/**
 * Determine which facets are specified (preselection) vs requested (facetorder)
 * Matches Python specified_vs_facets method
 *
 * A facet goes into facetorder if:
 * - It's NOT specified in query, OR
 * - It IS specified AND hasChildrenOfSameFacet=true
 */
function specifiedVsFacets(query: TreeDiscoveryQuery): { specified: Record<string, string>; facets: string[] } {
    const specified: Record<string, string> = {};
    const facets: string[] = [];

    for (const facet of SORTED_FACETS) {
        const value = query[facet];
        if (value) {
            // Facet is specified - add to preselection
            specified[facet] = value.name;
            // Add to facetorder only if hasChildrenOfSameFacet=true
            if (value.hasChildrenOfSameFacet) {
                facets.push(facet);
            }
        } else {
            // Facet not specified - add to facetorder
            facets.push(facet);
        }
    }

    return { specified, facets };
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse tree discovery response XML - matches Python extract_for_tree
 */
function extractForTree(xml: string): Result<TreeDiscoveryResponse, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const virtualFolders: Partial<Record<string, VirtualFolder[]>> = {};
    const objects: Array<{ name: string; type: string }> = [];

    // Process virtual folder elements
    const vfElements = doc.getElementsByTagName('vfs:virtualFolder');
    for (let i = 0; i < vfElements.length; i++) {
        const vf = vfElements[i];
        if (!vf) continue;

        const facet = vf.getAttribute('facet')?.toUpperCase();
        const name = vf.getAttribute('name');
        const hasChildren = vf.getAttribute('hasChildrenOfSameFacet') === 'true';
        const counter = vf.getAttribute('counter');

        if (!facet || !name) continue;

        if (!virtualFolders[facet]) {
            virtualFolders[facet] = [];
        }
        const folder: VirtualFolder = {
            name,
            hasChildrenOfSameFacet: hasChildren,
        };
        if (counter) {
            folder.count = parseInt(counter, 10);
        }
        virtualFolders[facet].push(folder);
    }

    // Process object elements
    const objElements = doc.getElementsByTagName('vfs:object');
    for (let i = 0; i < objElements.length; i++) {
        const obj = objElements[i];
        if (!obj) continue;

        const name = obj.getAttribute('name');
        const type = obj.getAttribute('type');

        if (!name || !type) continue;
        objects.push({ name, type });
    }

    console.log('Parsed virtualFolders:', Object.fromEntries(
        Object.entries(virtualFolders).map(([k, v]) => [k, v?.map(f => f.name)])
    ));
    console.log('Parsed objects:', objects.map(o => `${o.type}:${o.name}`));

    return ok({ virtualFolders, objects });
}

/**
 * Merge two tree discovery responses - matches Python merge_outputs
 */
function mergeOutputs(output1: TreeDiscoveryResponse, output2: TreeDiscoveryResponse): TreeDiscoveryResponse {
    // Merge virtual folders
    for (const [facet, folders] of Object.entries(output2.virtualFolders)) {
        if (!folders) continue;
        if (!output1.virtualFolders[facet]) {
            output1.virtualFolders[facet] = folders;
        } else {
            output1.virtualFolders[facet] = output1.virtualFolders[facet]!.concat(folders);
            // Sort by name
            output1.virtualFolders[facet].sort((a, b) => a.name.localeCompare(b.name));
        }
    }

    // Merge objects
    output1.objects = output1.objects.concat(output2.objects);

    return output1;
}

// ============================================================================
// Conversion to TreeNode
// ============================================================================

/**
 * Convert internal response to TreeNode array
 */
function convertToTreeNodes(response: TreeDiscoveryResponse): TreeNode[] {
    const nodes: TreeNode[] = [];

    // Convert virtual folders - preserve original names (including ".." prefix if present)
    // Display formatting should happen in the UI layer
    for (const [facet, folders] of Object.entries(response.virtualFolders)) {
        if (!folders) continue;
        for (const folder of folders) {
            const node: TreeNode = {
                name: folder.name,
                type: 'folder',
                facet,
                hasChildren: folder.hasChildrenOfSameFacet,
            };
            if (folder.count !== undefined) {
                node.count = folder.count;
            }
            nodes.push(node);
        }
    }

    // Convert objects
    for (const obj of response.objects) {
        const config = getConfigByType(obj.type);
        if (!config) {
            console.log(`Skipping unknown object type: ${obj.type} for ${obj.name}`);
            continue;
        }
        nodes.push({
            name: obj.name,
            type: 'object',
            objectType: config.label,
            extension: config.extension,
        });
    }

    return nodes;
}

// ============================================================================
// Legacy exports for packages.ts compatibility
// ============================================================================

export type { TreeDiscoveryQuery as SimpleTreeQuery };
export type { TreeDiscoveryResponse };

/**
 * Internal tree discovery - exported for packages.ts
 */
export async function getTreeInternal(
    client: AdtRequestor,
    query: TreeDiscoveryQuery,
    searchPattern: string
): AsyncResult<{ nodes: TreeNode[]; packages: Package[] }, Error> {
    const [response, error] = await treeDiscovery(client, query, searchPattern);
    if (error) return err(error);

    const nodes = convertToTreeNodes(response);
    const packages: Package[] = [];

    // Extract package info
    const pkgFolders = response.virtualFolders['PACKAGE'];
    if (pkgFolders) {
        for (const folder of pkgFolders) {
            packages.push({
                name: folder.name.startsWith('..') ? folder.name.substring(2) : folder.name,
            });
        }
    }

    return ok({ nodes, packages });
}
