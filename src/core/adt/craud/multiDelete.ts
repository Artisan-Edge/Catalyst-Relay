// Multi-delete with where-used dependency analysis and wave-based parallel execution.

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor } from '../types';
import { getConfigByExtension, OBJECT_CONFIG_MAP } from '../types';
import { findWhereUsed, type Dependency } from '../discovery/whereUsed';
import { lockObject, unlockObject } from './lock';
import { deleteObject } from './delete';
import { objectExists } from './objectExists';
import { mapLimited } from '../../utils/concurrency';
import { debug } from '../../utils/logging';
import { FUNCTION_GROUP, isFunctionGroup } from '../functionGroup/names';
import { isOwnGroupReference, owningGroupInSet } from '../functionGroup/deleteRules';

export interface DeleteResult {
    name: string;
    extension: string;
    /** not_found: the object does not exist, so nothing was deleted */
    status: 'success' | 'not_found' | 'error';
    message?: string;
}

export interface ExternalReference {
    object: ObjectRef;
    referencedBy: Dependency;
}

export class ExternalReferencesError extends Error {
    constructor(public references: ExternalReference[]) {
        super(`Cannot delete: ${references.length} external reference(s) prevent the operation`);
        this.name = 'ExternalReferencesError';
    }
}

function objKey(o: { name: string; extension: string }): string {
    return `${o.name.toLowerCase()}|${o.extension}`;
}

export async function multiDeleteObjects(
    client: AdtRequestor,
    objects: ObjectRef[],
    transport: string | undefined
): AsyncResult<DeleteResult[], Error> {
    if (objects.length === 0) return ok([]);

    // Validate extensions
    for (const obj of objects) {
        if (!getConfigByExtension(obj.extension)) {
            return err(new Error(`Unsupported extension: ${obj.extension}`));
        }
    }

    // Deduplicate by name+extension
    const setKeys = new Set<string>();
    const unique: ObjectRef[] = [];
    for (const obj of objects) {
        const key = objKey(obj);
        if (setKeys.has(key)) continue;
        setKeys.add(key);
        unique.push(obj);
    }

    // Run where-used in parallel
    const [whereUsedLists, whereUsedErr] = await mapLimited(unique, async (obj): AsyncResult<Dependency[], Error> => {
        const [usages, e] = await findWhereUsed(client, obj);
        if (e) return err(new Error(`where-used failed for ${obj.name}: ${e.message}`));
        return ok(usages);
    });
    if (whereUsedErr) return err(whereUsedErr);

    // Build referencer/dependent maps and detect external references.
    // findWhereUsed(O) returns objects R that USE O. Edge R → O ("R must be deleted before O").
    const referencers = new Map<string, string[]>();
    const dependents = new Map<string, string[]>();
    const externalRefs: ExternalReference[] = [];

    for (const obj of unique) {
        referencers.set(objKey(obj), []);
        dependents.set(objKey(obj), []);
    }

    const lockObjects = unique.filter(obj => obj.extension === LOCK_OBJECT.extension);
    const groups = new Set(unique.filter(isFunctionGroup).map(obj => obj.name.toUpperCase()));

    for (let i = 0; i < unique.length; i++) {
        const obj = unique[i]!;
        const oKey = objKey(obj);
        const deps = whereUsedLists[i]!;
        const generatedGroupCovered = lockModulesCovered(deps, lockObjects);
        for (const dep of deps) {
            // The generated lock module group stands for the lock objects in the set, but only
            // when every lock module hit belongs to one of them.
            if (LOCK_MODULE_GROUP.test(dep.name) && generatedGroupCovered) continue;
            const dKey = referencedKey(dep, lockObjects, groups);
            if (dKey === oKey) continue;
            // SAP comments out a deleted function group include's INCLUDE line in its own group.
            if (isOwnGroupReference(obj, dep)) continue;
            if (!setKeys.has(dKey)) {
                externalRefs.push({
                    object: { name: obj.name, extension: obj.extension },
                    referencedBy: dep,
                });
                continue;
            }
            referencers.get(oKey)!.push(dKey);
            dependents.get(dKey)!.push(oKey);
        }
    }

    if (externalRefs.length > 0) {
        return err(new ExternalReferencesError(externalRefs));
    }

    // Initialize Kahn's bookkeeping. in-degree(O) = count of in-set referencers of O.
    const objByKey = new Map<string, ObjectRef>();
    for (const obj of unique) objByKey.set(objKey(obj), obj);

    const inDegree = new Map<string, number>();
    for (const [k, refs] of referencers.entries()) {
        inDegree.set(k, refs.length);
    }

    const remaining = new Set<string>(setKeys);
    const results: DeleteResult[] = [];

    const deleteOne = async (obj: ObjectRef): Promise<DeleteResult> => {
        // SAP's own answer for a missing object is unreliable (success for message classes)
        const [exists, existsErr] = await objectExists(client, obj);
        if (existsErr) debug(`Existence check of ${obj.name}.${obj.extension} failed: ${existsErr.message}`);
        if (exists === false) {
            const label = getConfigByExtension(obj.extension)?.label ?? obj.extension;
            return { name: obj.name, extension: obj.extension, status: 'not_found', message: `${label} ${obj.name.toUpperCase()} does not exist` };
        }

        const [lockHandle, lockErr] = await lockObject(client, obj);
        if (lockErr) {
            return { name: obj.name, extension: obj.extension, status: 'error', message: lockErr.message };
        }
        // SAP keeps the lock of some deleted types (DDLS, DCLS, MSAG) in the session, blocking a
        // re-create of the name: release it on every path. Best effort: a failed unlock doesn't undo the delete.
        const [, deleteErr] = await deleteObject(client, obj, lockHandle, transport);
        await unlockObject(client, obj, lockHandle);
        if (deleteErr) {
            return { name: obj.name, extension: obj.extension, status: 'error', message: deleteErr.message };
        }
        return { name: obj.name, extension: obj.extension, status: 'success' };
    };

    // Wave-by-wave parallel deletion.
    while (remaining.size > 0) {
        const ready: string[] = [];
        for (const key of remaining) {
            if ((inDegree.get(key) ?? 0) === 0) ready.push(key);
        }

        // Cycle: no ready nodes but some remain — run all leftovers in parallel as best-effort.
        const waveKeys = ready.length > 0 ? ready : [...remaining];

        const waveObjects = waveKeys.map(k => objByKey.get(k)!);
        const [waveResults, waveErr] = await mapLimited(waveObjects, async obj => ok(await deleteOne(obj)));
        if (waveErr) return err(waveErr);

        for (let i = 0; i < waveResults.length; i++) {
            const result = waveResults[i]!;
            const key = waveKeys[i]!;
            results.push(result);
            remaining.delete(key);

            // Only objects now gone (deleted or never there) unblock downstream nodes.
            if (result.status !== 'error') {
                for (const o of dependents.get(key) ?? []) {
                    inDegree.set(o, (inDegree.get(o) ?? 0) - 1);
                }
            }
        }
    }

    return ok(results);
}

const LOCK_OBJECT = OBJECT_CONFIG_MAP.asenqu;
// Function groups SAP generates the ENQUEUE_/DEQUEUE_ modules of lock objects into
const LOCK_MODULE_GROUP = /^\/1BCDWBEN\//i;
const LOCK_MODULE = /^(?:ENQUEUE|DEQUEUE)_(.+)$/i;

// Key a where-used hit stands for: a lock module → its lock object in the set; an include,
// module or main program of a function group in the set → that group; else the hit itself.
function referencedKey(dep: Dependency, lockObjects: readonly ObjectRef[], groups: ReadonlySet<string>): string {
    const lockObject = lockObjectOfModule(dep, lockObjects);
    if (lockObject) return objKey(lockObject);
    const group = owningGroupInSet(dep, groups);
    if (group) return objKey({ name: group, extension: FUNCTION_GROUP.extension });
    return objKey(dep);
}

function lockObjectOfModule(dep: Dependency, lockObjects: readonly ObjectRef[]): ObjectRef | null {
    const match = LOCK_MODULE.exec(dep.name);
    if (!match?.[1]) return null;
    return lockObjects.find(obj => obj.name.toUpperCase() === match[1]!.toUpperCase()) ?? null;
}

// True when the hits include lock modules and all of them belong to lock objects in the set
function lockModulesCovered(deps: readonly Dependency[], lockObjects: readonly ObjectRef[]): boolean {
    const modules = deps.filter(dep => LOCK_MODULE.test(dep.name));
    return modules.length > 0 && modules.every(dep => lockObjectOfModule(dep, lockObjects) !== null);
}
