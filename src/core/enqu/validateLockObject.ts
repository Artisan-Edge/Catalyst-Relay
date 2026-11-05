/**
 * Validate Lock Object — rules SAP would otherwise reject on create or activation
 */

import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';
import type { LockObjectDef } from './types';
import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH } from './types';

// E<name>, or /NS/E<name> in a namespace
const NAME_PATTERN = /^(\/[A-Z0-9_]+\/)?E[A-Z0-9_]+$/i;

/**
 * Check name, description, tables and parameters
 *
 * A table that does not exist is only reported by SAP at activation.
 */
export function validateLockObject(def: LockObjectDef): Result<void, Error> {
    if (!NAME_PATTERN.test(def.name)) return err(new Error(`Lock object name ${def.name} must start with E (or /NS/E in a namespace)`));
    if (def.name.length > MAX_NAME_LENGTH) return err(new Error(`Lock object name ${def.name} is longer than ${MAX_NAME_LENGTH} characters`));
    if (!def.description) return err(new Error("A lock object needs a description (@EndUserText.label: '...')"));
    if (def.description.length > MAX_DESCRIPTION_LENGTH) return err(new Error(`Description is longer than ${MAX_DESCRIPTION_LENGTH} characters`));

    const tables = [def.primary, ...def.secondary].map(t => t.table.toUpperCase());
    if (new Set(tables).size !== tables.length) return err(new Error('A table is listed more than once'));

    if (def.parameters.length === 0) return err(new Error('A lock object needs at least one lock parameter'));
    const names = new Set<string>();
    for (const parameter of def.parameters) {
        const name = parameter.name.toUpperCase();
        if (names.has(name)) return err(new Error(`Lock parameter ${parameter.name} is declared twice`));
        names.add(name);
        if (!tables.includes(parameter.table.toUpperCase())) return err(new Error(`Lock parameter ${parameter.name} uses table ${parameter.table}, which is not the primary or a secondary table`));
    }
    return ok(undefined);
}
