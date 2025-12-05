/**
 * ADT Discovery Operations
 *
 * Package discovery, hierarchical tree browsing, and transport listing.
 */

import { DOMParser } from '@xmldom/xmldom';
import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { TreeQuery } from '../../types/requests';
import type { Package, TreeNode, Transport } from '../../types/responses';
import { getConfigByType } from './types';
import { extractError, dictToAbapXml } from '../utils/xml';
import type { AdtRequestor } from './types';

/**
 * Virtual folder for tree discovery
 */
interface VirtualFolder {
    name: string;
    hasChildrenOfSameFacet: boolean;
    count?: string;
}

/**
 * Tree discovery internal query
 */
interface TreeDiscoveryQuery {
    PACKAGE?: VirtualFolder;
    TYPE?: VirtualFolder;
    GROUP?: VirtualFolder;
    API?: VirtualFolder;
}

/**
 * Get list of available packages
 *
 * @param client - ADT client
 * @returns Array of packages or error
 */
export async function getPackages(
    client: AdtRequestor
): AsyncResult<Package[], Error> {
    const [treeResult, treeErr] = await getTreeInternal(client, {}, '*');
    if (treeErr) {
        return err(treeErr);
    }

    return ok(treeResult.packages);
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
 * Get transports for a package
 *
 * @param client - ADT client
 * @param packageName - Package name
 * @returns Array of transports or error
 */
export async function getTransports(
    client: AdtRequestor,
    packageName: string
): AsyncResult<Transport[], Error> {
    const contentType = 'application/vnd.sap.as+xml; charset=UTF-8; dataname=com.sap.adt.transport.service.checkData';

    const body = `<?xml version="1.0" encoding="UTF-8"?>
                    <asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml">
                    <asx:values>
                        <DATA>
                        <PGMID></PGMID>
                        <OBJECT></OBJECT>
                        <OBJECTNAME></OBJECTNAME>
                        <DEVCLASS>${packageName}</DEVCLASS>
                        <SUPER_PACKAGE></SUPER_PACKAGE>
                        <OPERATION>I</OPERATION>
                        <URI>/sap/bc/adt/ddic/ddl/sources/transport_check</URI>
                        </DATA>
                    </asx:values>
                    </asx:abap>`;

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/cts/transportchecks',
        headers: {
            'Accept': contentType,
            'Content-Type': contentType,
        },
        body,
    });

    if (requestErr) {
        return err(requestErr);
    }

    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Failed to fetch transports for ${packageName}: ${errorMsg}`));
    }

    const text = await response.text();
    const [transports, parseErr] = extractTransports(text);
    if (parseErr) {
        return err(parseErr);
    }

    return ok(transports);
}

/**
 * Internal tree discovery with full options
 */
async function getTreeInternal(
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

        const namespaces = { vfs: 'http://www.sap.com/adt/ris/virtualFolders' };
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

/**
 * Extract transports from XML response
 */
function extractTransports(xml: string): [Transport[], null] | [null, Error] {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');

        const transports: Transport[] = [];
        const reqHeaders = doc.getElementsByTagName('REQ_HEADER');

        for (let i = 0; i < reqHeaders.length; i++) {
            const header = reqHeaders[i];
            if (!header) continue;

            const trkorrElement = header.getElementsByTagName('TRKORR')[0];
            const userElement = header.getElementsByTagName('AS4USER')[0];
            const textElement = header.getElementsByTagName('AS4TEXT')[0];

            if (!trkorrElement || !userElement || !textElement) {
                continue;
            }

            const id = trkorrElement.textContent;
            const owner = userElement.textContent;
            const description = textElement.textContent;

            if (!id || !owner || !description) {
                continue;
            }

            transports.push({
                id,
                owner,
                description,
                status: 'modifiable',
            });
        }

        return [transports, null];
    } catch (error) {
        if (error instanceof Error) {
            return [null, error];
        }
        return [null, new Error('Failed to parse transports')];
    }
}
