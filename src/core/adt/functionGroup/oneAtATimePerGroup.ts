/**
 * One At A Time Per Group — write a function group's includes one after another
 *
 * An include is created in a stateless request of its own context (see OBJECT_CONFIG_MAP.asfinc):
 * a stateful create after the session activated the group fails with "SAPL<group> not found" and
 * leaves SAPL<group> enqueued. That create enqueues the whole group for its request, so another
 * create or a lock on a sibling include at the same time fails ("Editing canceled", "Object <group>
 * is already being edited"). Include writes of one group are therefore queued per client.
 */

import type { ObjectRef } from '../../../types/requests';
import type { AdtRequestor } from '../types';
import { isFunctionGroupInclude } from './names';

const queues = new WeakMap<AdtRequestor, Map<string, Promise<unknown>>>();

/**
 * Run work after the client's earlier queued work on the same group; other objects run at once
 *
 * @param client - ADT client (queues are per client)
 * @param object - Object being written
 * @param work - The write (must not queue again for the same group)
 */
export function oneAtATimePerGroup<T>(client: AdtRequestor, object: ObjectRef, work: () => Promise<T>): Promise<T> {
    if (!isFunctionGroupInclude(object) || !object.container) return work();

    const byGroup = queues.get(client) ?? new Map<string, Promise<unknown>>();
    queues.set(client, byGroup);
    const group = object.container.toUpperCase();

    const run = (byGroup.get(group) ?? Promise.resolve()).then(work);
    const tail = run.then(() => undefined, () => undefined);
    byGroup.set(group, tail);
    void tail.then(() => {
        if (byGroup.get(group) === tail) byGroup.delete(group);
    });
    return run;
}
