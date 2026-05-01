// Multi-delete with where-used dependency analysis and wave-based parallel execution.

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor } from '../types';
import { getConfigByExtension } from '../types';
import { findWhereUsed, type Dependency } from '../discovery/whereUsed';
import { lockObject, unlockObject } from './lock';
import { deleteObject } from './delete';

export interface DeleteResult {
    name: string;
    extension: string;
    status: 'success' | 'error';
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
    const whereUsedResults = await Promise.all(
        unique.map(obj => findWhereUsed(client, obj))
    );

    for (let i = 0; i < whereUsedResults.length; i++) {
        const [, e] = whereUsedResults[i]!;
        if (e) return err(new Error(`where-used failed for ${unique[i]!.name}: ${e.message}`));
    }

    // Build referencer/dependent maps and detect external references.
    // findWhereUsed(O) returns objects R that USE O. Edge R → O ("R must be deleted before O").
    const referencers = new Map<string, string[]>();
    const dependents = new Map<string, string[]>();
    const externalRefs: ExternalReference[] = [];

    for (const obj of unique) {
        referencers.set(objKey(obj), []);
        dependents.set(objKey(obj), []);
    }

    for (let i = 0; i < unique.length; i++) {
        const obj = unique[i]!;
        const oKey = objKey(obj);
        const [deps] = whereUsedResults[i]!;
        for (const dep of deps!) {
            const dKey = objKey(dep);
            if (dKey === oKey) continue;
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
        const [lockHandle, lockErr] = await lockObject(client, obj);
        if (lockErr) {
            return { name: obj.name, extension: obj.extension, status: 'error', message: lockErr.message };
        }
        const [, deleteErr] = await deleteObject(client, obj, lockHandle, transport);
        if (deleteErr) {
            await unlockObject(client, obj, lockHandle);
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
        const waveResults = await Promise.all(waveObjects.map(deleteOne));

        for (let i = 0; i < waveResults.length; i++) {
            const result = waveResults[i]!;
            const key = waveKeys[i]!;
            results.push(result);
            remaining.delete(key);

            // Only successful deletions unblock downstream nodes.
            if (result.status === 'success') {
                for (const o of dependents.get(key) ?? []) {
                    inDegree.set(o, (inDegree.get(o) ?? 0) - 1);
                }
            }
        }
    }

    return ok(results);
}
