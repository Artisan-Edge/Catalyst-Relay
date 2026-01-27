/**
 * Upsert methods (create or update)
 */

import type { AsyncResult } from '../../../../types/result';
import type { ObjectRef, ObjectContent } from '../../../../types/requests';
import type { AdtRequestor, UpsertResult } from '../../../adt';
import type { ClientState } from '../../types';
import { ok, err, resolveAllAsync } from '../../../../types/result';
import { normalizeContent } from '../../../utils';
import * as adt from '../../../adt';
import { create } from './create';
import { update } from './update';

export async function upsertSingle(
    state: ClientState,
    requestor: AdtRequestor,
    object: ObjectContent,
    packageName: string,
    transport?: string
): AsyncResult<UpsertResult> {
    if (!state.session) return err(new Error('Not logged in'));

    // Try to read existing object
    const objRef: ObjectRef = { name: object.name, extension: object.extension };
    const [existing] = await adt.readObject(requestor, objRef);

    // Object doesn't exist - create it
    if (!existing) {
        const [, createErr] = await create(state, requestor, object, packageName, transport);
        if (createErr) return err(createErr);

        const result: UpsertResult = {
            name: object.name,
            extension: object.extension,
            status: 'created',
        };
        if (transport) result.transport = transport;
        return ok(result);
    }

    // Compare normalized content to avoid unnecessary updates
    const serverContent = normalizeContent(existing.content);
    const localContent = normalizeContent(object.content);

    if (serverContent === localContent) {
        const result: UpsertResult = {
            name: object.name,
            extension: object.extension,
            status: 'unchanged',
        };
        if (transport) result.transport = transport;
        return ok(result);
    }

    // Content differs - update it
    const [, updateErr] = await update(state, requestor, object, transport);
    if (updateErr) return err(updateErr);

    const result: UpsertResult = {
        name: object.name,
        extension: object.extension,
        status: 'updated',
    };
    if (transport) result.transport = transport;
    return ok(result);
}

export async function upsert(
    state: ClientState,
    requestor: AdtRequestor,
    objects: ObjectContent[],
    packageName: string,
    transport?: string
): AsyncResult<UpsertResult[]> {
    // Confirm we can execute this request.
    if (!state.session) return err(new Error('Not logged in'));
    if (objects.length === 0) return ok([]);

    // Dispatch all upserts in sync.
    const asyncResults: AsyncResult<UpsertResult>[] = [];
    for (const obj of objects) {
        if (!obj.name || !obj.extension) continue;
        asyncResults.push(upsertSingle(state, requestor, obj, packageName, transport));
    }

    // Await all responses.
    const [results, error] = await resolveAllAsync(asyncResults);
    if (error) return err(error);
    return ok(results);
}
