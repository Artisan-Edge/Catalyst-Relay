/**
 * Tree — Hierarchical tree browsing for packages
 */

import type { AsyncResult } from '../../../../types/result';
import { ok, err } from '../../../../types/result';
import type { TreeQuery } from '../../../../types/requests';
import type { AdtRequestor } from '../../types';
import type { TreeResponse, PackageNode } from './types';
import { API_FOLDERS } from './types';
import { getSubpackages } from './subpackages';
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
    // If no package specified, return only top-level packages
    if (!query.package) {
        const [packages, pkgErr] = await getSubpackages(client);
        if (pkgErr) return err(pkgErr);

        return ok({
            packages,
            folders: [],
            objects: [],
        });
    }

    // If no path specified, fetch subpackages via nodestructure
    let packages: PackageNode[] = [];

    if (!query.path) {
        const [subpkgs, subErr] = await getSubpackages(client, query.package);
        if (subErr) return err(subErr);
        packages = subpkgs;
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
