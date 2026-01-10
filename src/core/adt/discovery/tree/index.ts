/**
 * Tree — Hierarchical tree browsing for packages
 */

import type { AsyncResult } from '../../../../types/result';
import { ok, err } from '../../../../types/result';
import type { TreeQuery } from '../../../../types/requests';
import type { AdtRequestor } from '../../types';
import type { TreeResponse, PackageNode } from './types';
import { API_FOLDERS } from './types';
import { fetchChildPackages } from './childPackages';
import { buildQueryFromPath, transformToTreeResponse } from './parsers';
import { fetchVirtualFolders, fetchObjectsWithApiState } from './virtualFolders';

// Re-export types
export type {
    TreeResponse,
    PackageNode,
    FolderNode,
    ObjectNode,
    ApiState,
} from './types';

/**
 * Get hierarchical tree contents for a package.
 * If package is omitted, returns top-level packages only.
 */
export async function getTree(
    client: AdtRequestor,
    query: TreeQuery = {}
): AsyncResult<TreeResponse, Error> {
    // If no package specified, return only top-level packages using virtualfolders
    // (nodestructure endpoint doesn't return object counts)
    if (!query.package) {
        const [parsed, parseErr] = await fetchVirtualFolders(client, {});
        if (parseErr) return err(parseErr);

        // Filter to only PACKAGE facet folders and transform to PackageNode[]
        const packages: PackageNode[] = parsed.folders
            .filter(f => f.facet === 'PACKAGE')
            .map(f => {
                const pkg: PackageNode = {
                    name: f.name,
                    numContents: f.count,
                };
                if (f.description) pkg.description = f.description;
                return pkg;
            });

        return ok({
            packages,
            folders: [],
            objects: [],
        });
    }

    // If no path specified, fetch child packages via virtualfolders
    let packages: PackageNode[] = [];

    if (!query.path) {
        const [childPkgs, childErr] = await fetchChildPackages(client, query.package);
        if (childErr) return err(childErr);
        packages = childPkgs;
    }

    // Build internal query from path segments
    const internalQuery = buildQueryFromPath(query.package, query.path);

    // Execute virtualfolders for folders/objects
    const [parsed, parseErr] = await fetchVirtualFolders(client, internalQuery);
    if (parseErr) return err(parseErr);

    // Check if we're at the TYPE level (results are API folders)
    const pathSegments = query.path?.split('/').filter(s => s.length > 0) ?? [];
    const hasApiFolders = parsed.folders.length > 0 &&
        parsed.folders.every(f => f.facet === 'API');

    if (pathSegments.length >= 2 && hasApiFolders) {
        // At TYPE level - fetch objects from all API folders and merge with apiState
        const [objects, objErr] = await fetchObjectsWithApiState(
            client,
            query.package,
            pathSegments,
            API_FOLDERS
        );
        if (objErr) return err(objErr);

        return ok({
            packages,
            folders: [],
            objects,
        });
    }

    const result = transformToTreeResponse(parsed, query.package);
    result.packages = packages;

    return ok(result);
}
