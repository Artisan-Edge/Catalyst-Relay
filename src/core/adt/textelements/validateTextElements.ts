// Pre-flight checks SAP would otherwise answer with an opaque 406 (DS512)

import type { Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { TextElementEntry, TextElementsPart } from './types';

const MAX_SYMBOL_KEY_LENGTH = 3;
const MAX_SYMBOL_LENGTH = 132;
const MAX_SELECTION_NAME_LENGTH = 8;
const SYMBOL_KEY = /^[A-Z0-9]+$/;

export function validateTextElements(part: TextElementsPart, entries: readonly TextElementEntry[]): Result<void, Error> {
    const seen = new Set<string>();
    for (const entry of entries) {
        if (seen.has(entry.key)) return err(new Error(`Duplicate key ${entry.key}`));
        seen.add(entry.key);

        const [, entryError] = part === 'symbols' ? validateSymbol(entry) : part === 'selections' ? validateSelection(entry) : ok(undefined);
        if (entryError) return err(entryError);
    }
    return ok(undefined);
}

function validateSymbol(entry: TextElementEntry): Result<void, Error> {
    if (entry.key.length > MAX_SYMBOL_KEY_LENGTH || !SYMBOL_KEY.test(entry.key)) {
        return err(new Error(`Text symbol key '${entry.key}' must be 1-${MAX_SYMBOL_KEY_LENGTH} letters or digits`));
    }
    if (entry.maxLength === undefined) return err(new Error(`Text symbol ${entry.key} has no @MaxLength line`));
    if (entry.maxLength < 1 || entry.maxLength > MAX_SYMBOL_LENGTH) {
        return err(new Error(`Text symbol ${entry.key}: @MaxLength must be 1-${MAX_SYMBOL_LENGTH}, got ${entry.maxLength}`));
    }
    if (entry.text.length > entry.maxLength) {
        return err(new Error(`Text symbol ${entry.key} is ${entry.text.length} characters, over its @MaxLength of ${entry.maxLength}`));
    }
    return ok(undefined);
}

function validateSelection(entry: TextElementEntry): Result<void, Error> {
    if (entry.key.length > MAX_SELECTION_NAME_LENGTH) {
        return err(new Error(`Selection name '${entry.key}' exceeds ${MAX_SELECTION_NAME_LENGTH} characters`));
    }
    return ok(undefined);
}
