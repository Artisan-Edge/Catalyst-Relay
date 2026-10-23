/**
 * Validate — SAP length and consistency rules, checked before any HTTP call
 */

import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';
import type { DataElementDef, DataElementLabels, DomainDef } from './types';

const MAX_NAME_LENGTH = 30;
const MAX_DESCRIPTION_LENGTH = 60;
const MAX_CONVERSION_ROUTINE_LENGTH = 5;
const MAX_FIXED_VALUE_TEXT_LENGTH = 60;
const LABEL_MAX_LENGTHS: Record<keyof DataElementLabels, number> = {
    short: 10,
    medium: 20,
    long: 40,
    heading: 55,
};

/**
 * Validate a data element definition
 *
 * @param def - Parsed definition
 * @returns ok, or an error listing every violation
 */
export function validateDataElement(def: DataElementDef): Result<void, Error> {
    const problems = commonProblems(def.name, def.description, 'data element');

    if (!def.description) problems.push('needs an @EndUserText.label or a long label (used as the description)');
    for (const [key, max] of Object.entries(LABEL_MAX_LENGTHS) as [keyof DataElementLabels, number][]) {
        if (def.labels[key].length > max) problems.push(`${key} label exceeds ${max} characters`);
    }
    if (def.domain && def.domain.length > MAX_NAME_LENGTH) problems.push(`domain name exceeds ${MAX_NAME_LENGTH} characters`);

    return report(def.name, problems);
}

/**
 * Validate a domain definition
 *
 * @param def - Parsed definition
 * @returns ok, or an error listing every violation
 */
export function validateDomain(def: DomainDef): Result<void, Error> {
    const problems = commonProblems(def.name, def.description, 'domain');

    if (!def.description) problems.push('needs an @EndUserText.label (used as the description)');
    if (def.conversionRoutine.length > MAX_CONVERSION_ROUTINE_LENGTH) {
        problems.push(`conversion routine exceeds ${MAX_CONVERSION_ROUTINE_LENGTH} characters`);
    }
    if (def.valueTable.length > MAX_NAME_LENGTH) problems.push(`value table name exceeds ${MAX_NAME_LENGTH} characters`);

    // Fixed values must fit the domain and be unique.
    const lows = new Set<string>();
    for (const value of def.fixedValues) {
        if (lows.has(value.low)) problems.push(`duplicate fixed value '${value.low}'`);
        lows.add(value.low);
        if (def.dataType.length > 0 && (value.low.length > def.dataType.length || value.high.length > def.dataType.length)) {
            problems.push(`fixed value '${value.low}' is longer than the domain length (${def.dataType.length})`);
        }
        if (value.text.length > MAX_FIXED_VALUE_TEXT_LENGTH) {
            problems.push(`fixed value '${value.low}' text exceeds ${MAX_FIXED_VALUE_TEXT_LENGTH} characters`);
        }
    }

    return report(def.name, problems);
}

function commonProblems(name: string, description: string, label: string): string[] {
    const problems: string[] = [];
    if (name.length > MAX_NAME_LENGTH) problems.push(`${label} name exceeds ${MAX_NAME_LENGTH} characters`);
    if (description.length > MAX_DESCRIPTION_LENGTH) problems.push(`description exceeds ${MAX_DESCRIPTION_LENGTH} characters`);
    return problems;
}

function report(name: string, problems: string[]): Result<void, Error> {
    if (problems.length === 0) return ok(undefined);
    return err(new Error(`Invalid ${name}: ${problems.join('; ')}`));
}
