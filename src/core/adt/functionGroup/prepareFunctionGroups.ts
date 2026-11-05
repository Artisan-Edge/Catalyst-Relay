/**
 * Prepare Function Groups — create the missing groups of an upsert batch before their parts
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { ObjectContent } from '../../../types/requests';
import type { AdtRequestor } from '../types';
import { ensureFunctionGroup } from './ensureFunctionGroup';
import { isFunctionGroup } from './names';

/**
 * Ensure every group the batch writes (its .asfugr files and the containers of its parts) exists.
 * A group with its own .asfugr in the batch is created with that file's description.
 *
 * @returns Names (uppercase) of the groups that were created
 */
export async function prepareFunctionGroups(client: AdtRequestor, objects: readonly ObjectContent[], packageName: string, transport: string | undefined, username: string): AsyncResult<string[], Error> {
    const groupFiles = new Map(objects.filter(isFunctionGroup).map(obj => [obj.name.toUpperCase(), obj]));
    const containers = objects.filter(obj => obj.container).map(obj => obj.container!.toUpperCase());
    const groups = [...new Set([...groupFiles.keys(), ...containers])];

    const created: string[] = [];
    for (const group of groups) {
        const [isNew, groupErr] = await ensureFunctionGroup(client, group, packageName, transport, username, groupFiles.get(group)?.description);
        if (groupErr) return err(groupErr);
        if (isNew) created.push(group);
    }
    return ok(created);
}
