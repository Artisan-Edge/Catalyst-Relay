/**
 * Delete Rules — which where-used hits and parts belong to a function group being deleted
 */

import type { ObjectRef } from '../../../types/requests';
import type { Dependency } from '../discovery/whereUsed';
import { OBJECT_CONFIG_MAP } from '../types';
import { FUNCTION_GROUP_INCLUDE, FUNCTION_MODULE, containerFromIncludeName, groupFromMainProgramName, groupFromUri, isFunctionGroup, isFunctionGroupInclude } from './names';

const INCLUDE_EXTENSIONS = [FUNCTION_GROUP_INCLUDE.extension, OBJECT_CONFIG_MAP.asinc.extension];
const PART_EXTENSIONS = [...INCLUDE_EXTENSIONS, FUNCTION_MODULE.extension, OBJECT_CONFIG_MAP.asprog.extension];

/**
 * Split objects into those deleted directly and the includes / modules of a group in the same set,
 * which SAP deletes with their group
 */
export function splitGroupParts<T extends ObjectRef>(objects: readonly T[]): { direct: T[]; parts: T[] } {
    const groups = new Set(objects.filter(isFunctionGroup).map(obj => obj.name.toUpperCase()));
    const isPart = (obj: T) => !isFunctionGroup(obj) && Boolean(obj.container && groups.has(obj.container.toUpperCase()));
    return { direct: objects.filter(obj => !isPart(obj)), parts: objects.filter(isPart) };
}

/**
 * True when the hit is the include's own group (SAP comments out its INCLUDE line there)
 */
export function isOwnGroupReference(object: ObjectRef, dep: Dependency): boolean {
    if (!isFunctionGroupInclude(object) || !object.container) return false;
    return isFunctionGroup(dep) && dep.name.toUpperCase() === object.container.toUpperCase();
}

/**
 * The group in the set a where-used hit belongs to: an include (e.g. a maintenance group's
 * generated LZFOOT00), module or main program of that group. Null for anything else.
 *
 * @param dep - Where-used hit
 * @param groups - Names (uppercase) of the function groups being deleted
 */
export function owningGroupInSet(dep: Dependency, groups: ReadonlySet<string>): string | null {
    if (groups.size === 0 || isFunctionGroup(dep) || !PART_EXTENSIONS.includes(dep.extension)) return null;
    const group = (dep.uri ? groupFromUri(dep.uri) : null)
        ?? (INCLUDE_EXTENSIONS.includes(dep.extension) ? containerFromIncludeName(dep.name) : null)
        ?? groupFromMainProgramName(dep.name);
    return group && groups.has(group) ? group : null;
}
