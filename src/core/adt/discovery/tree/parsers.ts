/**
 * Parsers — XML parsing and response transformation
 */

import type { Result } from '../../../../types/result';
import { ok, err } from '../../../../types/result';
import { getConfigByType } from '../../types';
import { safeParseXml } from '../../../utils/xml';
import type {
    TreeResponse,
    PackageNode,
    FolderNode,
    ObjectNode,
    TreeDiscoveryQuery,
    ParseResult,
    ParsedFolder,
} from './types';

/**
 * Build query from package and path
 */
export function buildQueryFromPath(packageName: string, path?: string): TreeDiscoveryQuery {
    const query: TreeDiscoveryQuery = {
        PACKAGE: {
            name: packageName.startsWith('..') ? packageName : `..${packageName}`,
            hasChildrenOfSameFacet: false,
        },
    };

    if (!path) return query;

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

/**
 * Construct tree discovery request body
 */
export function constructTreeBody(query: TreeDiscoveryQuery, searchPattern: string): string {
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

/**
 * Parse tree XML into structured data
 */
export function parseTreeXml(xml: string): Result<ParseResult, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const folders: ParsedFolder[] = [];
    const objects: { name: string; objectType: string; extension: string }[] = [];

    // Process virtual folder elements
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

        const technicalName = name.startsWith('..') ? name.substring(2) : name;
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

    // Process object elements
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

/**
 * Transform parsed data to TreeResponse
 */
export function transformToTreeResponse(parsed: ParseResult, queryPackage: string): TreeResponse {
    const packages: PackageNode[] = [];
    const folders: FolderNode[] = [];

    for (const folder of parsed.folders) {
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
