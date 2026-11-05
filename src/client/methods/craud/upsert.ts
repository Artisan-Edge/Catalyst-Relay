/**
 * Upsert methods (create or update)
 */

import type { AsyncResult } from '../../../types/result';
import type { ObjectRef, ObjectContent } from '../../../types/requests';
import type { AdtRequestor, UpsertResult } from '../../../core/adt';
import type { ClientState } from '../../types';
import { ok, err, resolveAllAsync } from '../../../types/result';
import * as adt from '../../../core/adt';
import { create } from './create';
import { update } from './update';

const FUNCTION_GROUP_EXTENSION = adt.OBJECT_CONFIG_MAP.asfugr.extension;

// Dependency order: function group parts (see FUNCTION_GROUP_UPSERT_ORDER), whose modules precede
// the domains that use them as conversion routines; domains before data elements, data elements
// before everything else.
const WAVE_ORDER: readonly string[] = [...adt.FUNCTION_GROUP_UPSERT_ORDER, adt.OBJECT_CONFIG_MAP.asdoma.extension, adt.OBJECT_CONFIG_MAP.asdtel.extension];
// After everything else: launchpad pages reference app descriptor items, spaces reference pages,
// role template space assignments reference spaces.
const LAST_WAVE_ORDER: readonly string[] = [adt.OBJECT_CONFIG_MAP.asuiad.extension, adt.OBJECT_CONFIG_MAP.asuipg.extension, adt.OBJECT_CONFIG_MAP.asuist.extension, adt.OBJECT_CONFIG_MAP.assiad.extension];

export async function upsertSingle(
    state: ClientState,
    requestor: AdtRequestor,
    object: ObjectContent,
    packageName: string,
    transport?: string
): AsyncResult<UpsertResult> {
    if (!state.session) return err(new Error('Not logged in'));
    const [, generatedErr] = adt.refuseGeneratedInclude(object);
    if (generatedErr) return err(generatedErr);
    const [, sourceErr] = adt.refuseInvalidAffSource(object);
    if (sourceErr) return err(sourceErr);

    // Try to read existing object
    const objRef: ObjectRef = { name: object.name, extension: object.extension };
    if (object.container) objRef.container = object.container;
    const [existing] = await adt.readObject(requestor, objRef);

    // Object doesn't exist - create it
    if (!existing) {
        const [, createErr] = await create(state, requestor, object, packageName, transport);
        if (createErr) return err(adt.withIncludeHint(object, createErr));
        return ok(buildResult(object, 'created', transport));
    }

    // Compare content to avoid unnecessary updates
    const [unchanged, compareErr] = adt.contentEquivalent(object.extension, object.content, existing.content);
    if (compareErr) return err(compareErr);
    if (unchanged) return ok(buildResult(object, 'unchanged', transport));

    // Content differs - update it
    const [, updateErr] = await update(state, requestor, object, transport);
    if (updateErr) return err(adt.withIncludeHint(object, updateErr));
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
    // Refuse the whole batch up front, before any wave writes, when one object can't be sent.
    for (const obj of valid) {
        const [, generatedErr] = adt.refuseGeneratedInclude(obj);
        if (generatedErr) return err(generatedErr);
        const [, sourceErr] = adt.refuseInvalidAffSource(obj);
        if (sourceErr) return err(sourceErr);
    }

    // Existing function modules may be addressed by name only.
    const [resolved, resolveErr] = await adt.resolveContainers(requestor, valid.filter(needsContainerLookup));
    if (resolveErr) return err(resolveErr);
    const byKey = new Map(resolved.map(obj => [objectKey(obj), obj]));
    const prepared = valid.map(obj => byKey.get(objectKey(obj)) ?? obj);

    // Create missing function groups before their includes and modules; a group with its own
    // .asfugr in the batch is reported by its wave, others are reported here.
    const [createdGroups, groupErr] = await adt.prepareFunctionGroups(requestor, prepared, packageName, transport, state.session.username);
    if (groupErr) return err(groupErr);
    const created = new Set(createdGroups);
    const groupFiles = new Set(prepared.filter(adt.isFunctionGroup).map(obj => obj.name.toUpperCase()));
    const results: UpsertResult[] = createdGroups
        .filter(group => !groupFiles.has(group))
        .map(group => buildResult({ name: group, extension: FUNCTION_GROUP_EXTENSION }, 'created', transport));

    // Upsert wave by wave; objects within a wave run in parallel, except the includes of one group.
    for (const wave of buildWaves(prepared)) {
        const [waveResults, waveErr] = await resolveAllAsync(wave.map(obj => adt.oneAtATimePerGroup(requestor, obj, () => upsertSingle(state, requestor, obj, packageName, transport))));
        if (waveErr) return err(waveErr);
        // A group created above is reported as created, not as the update of its main program.
        results.push(...waveResults.map(result => adt.isFunctionGroup(result) && created.has(result.name.toUpperCase()) ? { ...result, status: 'created' as const } : result));
    }
    return ok(results);
}

function buildWaves(objects: ObjectContent[]): ObjectContent[][] {
    const ofType = (extension: string) => objects.filter(obj => obj.extension === extension);
    const ordered = [...WAVE_ORDER, ...LAST_WAVE_ORDER];
    const waves = WAVE_ORDER.map(ofType);
    waves.push(objects.filter(obj => !ordered.includes(obj.extension)));
    waves.push(...LAST_WAVE_ORDER.map(ofType));
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
