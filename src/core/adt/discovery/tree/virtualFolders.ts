/**
 * VirtualFolders — Fetch folder contents and objects with API state
 */

import type { AsyncResult } from '../../../../types/result';
import { ok, err } from '../../../../types/result';
import type { AdtRequestor } from '../../types';
import { extractError } from '../../../utils/xml';
import type {
    ObjectNode,
    TreeDiscoveryQuery,
    ParseResult,
    ParsedObject,
    API_FOLDERS,
} from './types';
import { constructTreeBody, parseTreeXml } from './parsers';

/**
 * Fetch virtualfolders contents
 */
export async function fetchVirtualFolders(
    client: AdtRequestor,
    query: TreeDiscoveryQuery
): AsyncResult<ParseResult, Error> {
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
        return err(new Error(`Tree discovery failed: ${errorMsg}`));
    }

    const text = await response.text();
    return parseTreeXml(text);
}

/**
 * Fetch objects from all API folders and merge with apiState flags
 */
export async function fetchObjectsWithApiState(
    client: AdtRequestor,
    packageName: string,
    pathSegments: string[],
    apiFolders: readonly string[]
): AsyncResult<ObjectNode[], Error> {
    const group = pathSegments[0];
    const type = pathSegments[1];
    if (!group || !type) return ok([]);

    // Fetch objects from each API folder in parallel
    const apiQueries = apiFolders.map(apiFolder => ({
        apiFolder,
        query: {
            PACKAGE: { name: `..${packageName}`, hasChildrenOfSameFacet: false },
            GROUP: { name: group, hasChildrenOfSameFacet: false },
            TYPE: { name: type, hasChildrenOfSameFacet: false },
            API: { name: apiFolder, hasChildrenOfSameFacet: false },
        } as TreeDiscoveryQuery,
    }));

    const results = await Promise.all(
        apiQueries.map(async ({ apiFolder, query }) => {
            const [parsed, parseErr] = await fetchVirtualFolders(client, query);
            if (parseErr) return { apiFolder, objects: [] as ParsedObject[], error: parseErr };
            return { apiFolder, objects: parsed.objects, error: null };
        })
    );

    // Check for errors
    const errors = results.filter(r => r.error !== null);
    if (errors.length === results.length) {
        return err(errors[0]!.error!);
    }

    // Merge objects and build apiState
    const objectMap = new Map<string, ObjectNode>();

    for (const { apiFolder, objects } of results) {
        for (const obj of objects) {
            let node = objectMap.get(obj.name);
            if (!node) {
                node = {
                    name: obj.name,
                    objectType: obj.objectType,
                    extension: obj.extension,
                    apiState: {
                        useInCloudDevelopment: false,
                        useInCloudDvlpmntActive: false,
                        useInKeyUserApps: false,
                    },
                };
                objectMap.set(obj.name, node);
            }

            // Set the appropriate flag based on which folder the object was found in
            if (apiFolder === 'USE_IN_CLOUD_DEVELOPMENT') {
                node.apiState!.useInCloudDevelopment = true;
            } else if (apiFolder === 'USE_IN_CLOUD_DVLPMNT_ACTIVE') {
                node.apiState!.useInCloudDvlpmntActive = true;
            } else if (apiFolder === 'USE_IN_KEY_USER_APPS') {
                node.apiState!.useInKeyUserApps = true;
            }
            // NOT_RELEASED means all flags stay false (default)
        }
    }

    return ok(Array.from(objectMap.values()));
}
