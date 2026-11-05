/**
 * Apply AFF JSON Rules — reduce a local/server pair of AFF JSON values to what the local source owns
 */

import type { AffJsonRules } from '../types';

const ARRAY_SUFFIX = '[]';

/**
 * Copies of local and remote with the rules applied (inputs are not changed):
 * - serverOmitsFalse: object keys holding false are removed from both
 * - serverAdded paths the local value lacks are removed from remote
 * - serverDefaults are removed from both where the value equals the default
 * - serverOwned paths are removed from both
 * - caseInsensitive strings are lower-cased, stringValued numbers become strings, on both
 */
export function applyAffJsonRules(local: unknown, remote: unknown, rules: AffJsonRules): [unknown, unknown] {
    const ownedLocal = structuredClone(local);
    const ownedRemote = structuredClone(remote);
    if (rules.serverOmitsFalse) {
        dropFalse(ownedLocal);
        dropFalse(ownedRemote);
    }
    for (const path of rules.serverAdded ?? []) dropServerAdded(ownedLocal, ownedRemote, path.split('.'));
    for (const { path, value } of rules.serverDefaults ?? []) {
        const segments = path.split('.');
        dropDefault(ownedLocal, segments, value);
        dropDefault(ownedRemote, segments, value);
    }
    for (const side of [ownedLocal, ownedRemote]) {
        for (const path of rules.serverOwned ?? []) updateAt(side, path.split('.'), () => undefined);
        for (const path of rules.caseInsensitive ?? []) updateAt(side, path.split('.'), entry => typeof entry === 'string' ? entry.toLowerCase() : entry);
        for (const path of rules.stringValued ?? []) updateAt(side, path.split('.'), entry => typeof entry === 'number' ? String(entry) : entry);
    }
    return [ownedLocal, ownedRemote];
}

// Replace the value at a path (array items by `[]`); undefined deletes the key.
function updateAt(value: unknown, segments: string[], update: (entry: unknown) => unknown): void {
    const [segment, ...rest] = segments;
    if (segment === undefined || !isRecord(value)) return;
    const key = keyOf(segment);
    if (!(key in value)) return;

    if (segment.endsWith(ARRAY_SUFFIX)) {
        const items = value[key];
        if (Array.isArray(items)) items.forEach(item => updateAt(item, rest, update));
        return;
    }
    if (rest.length > 0) {
        updateAt(value[key], rest, update);
        return;
    }
    const next = update(value[key]);
    if (next === undefined) delete value[key];
    else value[key] = next;
}

// Walk both values in step (array items by index); delete the last key from remote where local lacks it.
function dropServerAdded(local: unknown, remote: unknown, segments: string[]): void {
    const [segment, ...rest] = segments;
    if (segment === undefined || !isRecord(remote)) return;
    const key = keyOf(segment);
    if (!(key in remote)) return;

    const localRecord = isRecord(local) ? local : null;
    if (segment.endsWith(ARRAY_SUFFIX)) {
        const remoteItems = remote[key];
        if (!Array.isArray(remoteItems)) return;
        const localItems = localRecord?.[key];
        remoteItems.forEach((item, index) => dropServerAdded(Array.isArray(localItems) ? localItems[index] : undefined, item, rest));
        return;
    }
    if (rest.length > 0) {
        dropServerAdded(localRecord?.[key], remote[key], rest);
        return;
    }
    if (!localRecord || !(key in localRecord)) delete remote[key];
}

function dropDefault(value: unknown, segments: string[], defaultValue: string | number | boolean): void {
    const [segment, ...rest] = segments;
    if (segment === undefined || !isRecord(value)) return;
    const key = keyOf(segment);

    if (segment.endsWith(ARRAY_SUFFIX)) {
        const items = value[key];
        if (Array.isArray(items)) items.forEach(item => dropDefault(item, rest, defaultValue));
        return;
    }
    if (rest.length > 0) {
        dropDefault(value[key], rest, defaultValue);
        return;
    }
    if (value[key] === defaultValue) delete value[key];
}

function dropFalse(value: unknown): void {
    if (Array.isArray(value)) {
        value.forEach(dropFalse);
        return;
    }
    if (!isRecord(value)) return;
    for (const [key, entry] of Object.entries(value)) {
        if (entry === false) delete value[key];
        else dropFalse(entry);
    }
}

function keyOf(segment: string): string {
    return segment.endsWith(ARRAY_SUFFIX) ? segment.slice(0, -ARRAY_SUFFIX.length) : segment;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
