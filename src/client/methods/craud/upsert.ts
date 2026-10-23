/**
 * Upsert methods (create or update)
 */

import type { AsyncResult, Result } from '../../../types/result';
import type { ObjectRef, ObjectContent } from '../../../types/requests';
import type { AdtRequestor, UpsertResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { ok, err, resolveAllAsync } from '../../../types/result';
import { normalizeContent } from '../../../core/utils';
import { getFormHandler } from '../../../core/ddic';
import * as adt from '../../../core/adt';
import { create } from './create';
import { update } from './update';

// Dependency order: function modules before the domains that use them as conversion
// routines, domains before data elements, data elements before everything else.
const WAVE_ORDER = ['asfunc', 'asdoma', 'asdtel'];
const FUNCTION_GROUP_EXTENSION = 'fugr';

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
    if (object.container) objRef.container = object.container;
    const [existing] = await adt.readObject(requestor, objRef);

    // Object doesn't exist - create it
    if (!existing) {
        const [, createErr] = await create(state, requestor, object, packageName, transport);
        if (createErr) return err(createErr);
        return ok(buildResult(object, 'created', transport));
    }

    // Compare content to avoid unnecessary updates
    const [unchanged, compareErr] = isUnchanged(object, existing.content);
    if (compareErr) return err(compareErr);
    if (unchanged) return ok(buildResult(object, 'unchanged', transport));

    // Content differs - update it
    const [, updateErr] = await update(state, requestor, object, transport);
    if (updateErr) return err(updateErr);
    return ok(buildResult(object, 'updated', transport));
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
    const valid = objects.filter(obj => obj.name && obj.extension);
    if (valid.length === 0) return ok([]);

    // Existing function modules may be addressed by name only.
    const [resolved, resolveErr] = await adt.resolveContainers(requestor, valid.filter(needsContainerLookup));
    if (resolveErr) return err(resolveErr);
    const byKey = new Map(resolved.map(obj => [objectKey(obj), obj]));
    const prepared = valid.map(obj => byKey.get(objectKey(obj)) ?? obj);

    // Create missing function groups before their modules.
    const results: UpsertResult[] = [];
    const groups = [...new Set(prepared.filter(obj => obj.container).map(obj => obj.container!.toUpperCase()))];
    for (const group of groups) {
        const [created, groupErr] = await adt.ensureFunctionGroup(requestor, group, packageName, transport, state.session.username);
        if (groupErr) return err(groupErr);
        if (created) results.push(buildResult({ name: group, extension: FUNCTION_GROUP_EXTENSION }, 'created', transport));
    }

    // Upsert wave by wave; objects within a wave run in parallel.
    for (const wave of buildWaves(prepared)) {
        const [waveResults, waveErr] = await resolveAllAsync(wave.map(obj => upsertSingle(state, requestor, obj, packageName, transport)));
        if (waveErr) return err(waveErr);
        results.push(...waveResults);
    }
    return ok(results);
}

// Form objects compare semantically; source objects compare normalized text.
function isUnchanged(object: ObjectContent, serverContent: string): Result<boolean> {
    const handler = adt.getConfigByExtension(object.extension)?.kind === 'form' ? getFormHandler(object.extension) : null;
    if (!handler) return ok(normalizeContent(serverContent) === normalizeContent(object.content));
    return handler.equivalent(object.content, serverContent);
}

function buildWaves(objects: ObjectContent[]): ObjectContent[][] {
    const waves = WAVE_ORDER.map(extension => objects.filter(obj => obj.extension === extension));
    waves.push(objects.filter(obj => !WAVE_ORDER.includes(obj.extension)));
    return waves.filter(wave => wave.length > 0);
}

function needsContainerLookup(object: ObjectContent): boolean {
    return Boolean(adt.getConfigByExtension(object.extension)?.container) && !object.container;
}

function objectKey(object: ObjectRef): string {
    return `${object.name.toUpperCase()}|${object.extension}`;
}

function buildResult(object: ObjectRef, status: UpsertResult['status'], transport: string | undefined): UpsertResult {
    const result: UpsertResult = { name: object.name, extension: object.extension, status };
    if (transport) result.transport = transport;
    return result;
}
