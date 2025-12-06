/**
 * Packages — List available packages
 */

import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { Package } from '../../types/responses';
import type { AdtRequestor } from './types';
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
    const [treeResult, treeErr] = await getTreeInternal(client, {}, '*');
    if (treeErr) {
        return err(treeErr);
    }

    return ok(treeResult.packages);
}
