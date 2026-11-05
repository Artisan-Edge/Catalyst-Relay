/**
 * With Function Group Parts — activate a function group's main program together with its includes
 *
 * Creating or deleting an include edits the main program SAPL<group> (adds or comments out its
 * INCLUDE line), and activating the group alone leaves a new include inactive. So an include is
 * always activated with its group, and a group with its inactive includes and function modules
 * (activating the group alone fails while one of its modules is inactive).
 */

import type { AsyncResult } from '../../../types/result';
import { ok } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor } from '../types';
import { getInactiveObjects } from '../discovery/inactiveObjects';
import { debug } from '../../utils/logging';
import { FUNCTION_GROUP, FUNCTION_GROUP_INCLUDE, FUNCTION_MODULE, containerFromUri, isFunctionGroup, isFunctionGroupInclude } from './names';

const GROUP_EXTENSION = FUNCTION_GROUP.extension;
// Inactive parts that activate with their group, by ADT type
const PART_EXTENSIONS: ReadonlyMap<string, string> = new Map([
    [FUNCTION_GROUP_INCLUDE.type, FUNCTION_GROUP_INCLUDE.extension],
    [FUNCTION_MODULE.type, FUNCTION_MODULE.extension],
]);

/**
 * Add the groups of function group includes, and the inactive includes and modules of function groups
 *
 * @param client - ADT client
 * @param objects - Objects to activate (containers resolved)
 * @returns The objects plus the parts that must activate with them
 */
export async function withFunctionGroupParts(client: AdtRequestor, objects: ObjectRef[]): AsyncResult<ObjectRef[], Error> {
    const key = (name: string, extension: string) => `${name.toUpperCase()}|${extension}`;
    const present = new Set(objects.map(obj => key(obj.name, obj.extension)));
    const requestedGroups = objects.filter(isFunctionGroup).map(obj => obj.name.toUpperCase());
    const includeGroups = objects.filter(obj => isFunctionGroupInclude(obj) && obj.container).map(obj => obj.container!.toUpperCase());
    if (requestedGroups.length === 0 && includeGroups.length === 0) return ok(objects);

    const added: ObjectRef[] = [];
    for (const group of new Set([...requestedGroups, ...includeGroups])) {
        if (present.has(key(group, GROUP_EXTENSION))) continue;
        present.add(key(group, GROUP_EXTENSION));
        added.push({ name: group, extension: GROUP_EXTENSION });
    }
    if (requestedGroups.length === 0) return ok([...objects, ...added]);

    // Best effort: without the inactive list, the requested objects still activate.
    const [entries, inactiveErr] = await getInactiveObjects(client);
    if (inactiveErr) {
        debug(`Inactive parts of ${requestedGroups.join(', ')} not looked up: ${inactiveErr.message}`);
        return ok([...objects, ...added]);
    }

    for (const entry of entries) {
        const object = entry.object;
        const extension = object && !object.deleted ? PART_EXTENSIONS.get(object.ref.type) : undefined;
        if (!object || !extension) continue;
        const group = containerFromUri(object.ref.uri);
        if (!group || !requestedGroups.includes(group)) continue;
        if (present.has(key(object.ref.name, extension))) continue;
        present.add(key(object.ref.name, extension));
        added.push({ name: object.ref.name, extension, container: group });
    }
    return ok([...objects, ...added]);
}
