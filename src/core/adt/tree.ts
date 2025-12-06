/**
 * Tree — Hierarchical tree browsing for packages
 */

import { DOMParser } from '@xmldom/xmldom';
import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { TreeQuery } from '../../types/requests';
import type { Package, TreeNode } from '../../types/responses';
import type { AdtRequestor } from './types';
import { getConfigByType } from './types';
import { extractError } from '../utils/xml';

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
    const internalQuery: TreeDiscoveryQuery = {};

    if (query.package) {
        internalQuery.PACKAGE = {
            name: query.package.startsWith('..') ? query.package : `..${query.package}`,
            hasChildrenOfSameFacet: false,
        };
    }

    const [result, resultErr] = await getTreeInternal(client, internalQuery, '*');
    if (resultErr) {
        return err(resultErr);
    }

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

    if (requestErr) {
        return err(requestErr);
    }

    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Tree discovery failed: ${errorMsg}`));
    }

    const text = await response.text();
    const [result, parseErr] = parseTreeResponse(text);
    if (parseErr) {
        return err(parseErr);
    }

    return ok(result);
}

/**
 * Construct tree discovery request body
 */
function constructTreeBody(query: TreeDiscoveryQuery, searchPattern: string): string {
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

    const specifiedXml = Object.entries(specified)
        .map(([facet, name]) => `<vfs:${facet.toLowerCase()}>${name}</vfs:${facet.toLowerCase()}>`)
        .join('\n                ');

    const facetsXml = facets
        .map(facet => `<vfs:facet>${facet}</vfs:facet>`)
        .join('\n                ');

    return `<?xml version="1.0" encoding="UTF-8"?>
        <vfs:vfsRequest xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders">
            <vfs:virtualFolder>
                ${specifiedXml}
            </vfs:virtualFolder>
            <vfs:facets>
                ${facetsXml}
            </vfs:facets>
            <vfs:searchPattern>${searchPattern}</vfs:searchPattern>
        </vfs:vfsRequest>`;
}

/**
 * Parse tree discovery response
 */
function parseTreeResponse(xml: string): [{ nodes: TreeNode[]; packages: Package[] }, null] | [null, Error] {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');

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
                if (desc) {
                    pkg.description = desc;
                }
                packages.push(pkg);
            }

            if (name && facet) {
                nodes.push({
                    name: name.startsWith('..') ? name.substring(2) : name,
                    type: 'folder',
                    hasChildren: vf.getAttribute('hasChildrenOfSameFacet') === 'true',
                });
            }
        }

        const objects = doc.getElementsByTagName('vfs:object');
        for (let i = 0; i < objects.length; i++) {
            const obj = objects[i];
            if (!obj) continue;

            const name = obj.getAttribute('name');
            const type = obj.getAttribute('type');

            if (!name || !type) {
                continue;
            }

            const config = getConfigByType(type);
            if (!config) {
                continue;
            }

            nodes.push({
                name,
                type: 'object',
                objectType: config.label,
                extension: config.extension,
            });
        }

        return [{ nodes, packages }, null];
    } catch (error) {
        if (error instanceof Error) {
            return [null, error];
        }
        return [null, new Error('Failed to parse tree response')];
    }
}
