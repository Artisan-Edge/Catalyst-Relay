/**
 * Packages — List available packages
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { Package } from './tree';
import { getTreeInternal } from './tree';

/**
 * Get list of available packages
 *
 * @param client - ADT client
 * @param filter - Package name filter pattern (default: '*' for all packages)
 *                 Examples: 'Z*' for custom packages, '$TMP' for local, 'ZSNAP*' for specific prefix
 * @returns Array of packages or error
 */
export async function getPackages(
    client: AdtRequestor,
    filter = '*'
): AsyncResult<Package[], Error> {
    // Fetch tree with packages matching the filter pattern.
    const [treeResult, treeErr] = await getTreeInternal(client, {}, filter);

    // Validate successful tree retrieval.
    if (treeErr) {
        return err(treeErr);
    }

    // Extract packages from tree result.
    return ok(treeResult.packages);
}
