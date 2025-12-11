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
 * @returns Array of packages or error
 */
export async function getPackages(
    client: AdtRequestor
): AsyncResult<Package[], Error> {
    // Fetch tree with all packages using wildcard filter.
    const [treeResult, treeErr] = await getTreeInternal(client, {}, '*');

    // Validate successful tree retrieval.
    if (treeErr) {
        return err(treeErr);
    }

    // Extract packages from tree result.
    return ok(treeResult.packages);
}
