/**
 * ABAP Types — predefined DDIC types usable in .asdtel / .asdoma sources
 *
 * ADT's dataType code is the uppercase DSL kind (confirmed for CHAR, NUMC, DEC,
 * DATS, INT4, STRING, RAWSTRING, SSTRING).
 */

import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';
import type { AbapType } from './types';

interface TypeRule {
    /** 'required': abap.x(n); 'none': fixed length, abap.x or abap.x(<fixed>); 'optional': abap.x or abap.x(n) */
    length: 'required' | 'none' | 'optional';
    /** Fixed or default length */
    defaultLength: number;
    decimals: boolean;
}

const TYPE_RULES: Record<string, TypeRule> = {
    char: { length: 'required', defaultLength: 0, decimals: false },
    numc: { length: 'required', defaultLength: 0, decimals: false },
    dec: { length: 'required', defaultLength: 0, decimals: true },
    curr: { length: 'required', defaultLength: 0, decimals: true },
    quan: { length: 'required', defaultLength: 0, decimals: true },
    raw: { length: 'required', defaultLength: 0, decimals: false },
    sstring: { length: 'required', defaultLength: 0, decimals: false },
    unit: { length: 'optional', defaultLength: 3, decimals: false },
    cuky: { length: 'none', defaultLength: 5, decimals: false },
    dats: { length: 'none', defaultLength: 8, decimals: false },
    tims: { length: 'none', defaultLength: 6, decimals: false },
    int1: { length: 'none', defaultLength: 3, decimals: false },
    int2: { length: 'none', defaultLength: 5, decimals: false },
    int4: { length: 'none', defaultLength: 10, decimals: false },
    int8: { length: 'none', defaultLength: 19, decimals: false },
    clnt: { length: 'none', defaultLength: 3, decimals: false },
    lang: { length: 'none', defaultLength: 1, decimals: false },
    fltp: { length: 'none', defaultLength: 16, decimals: false },
    string: { length: 'none', defaultLength: 0, decimals: false },
    rawstring: { length: 'none', defaultLength: 0, decimals: false },
};

/**
 * Supported DSL kinds, for error messages
 */
export const SUPPORTED_ABAP_TYPES = Object.keys(TYPE_RULES);

/**
 * Build a validated AbapType from parsed DSL parts
 *
 * @param kind - DSL kind (case-insensitive)
 * @param length - Length from the source, or null when absent
 * @param decimals - Decimals from the source, or null when absent
 * @returns Normalized type or error describing the violation
 */
export function resolveAbapType(kind: string, length: number | null, decimals: number | null): Result<AbapType, Error> {
    const normalized = kind.toLowerCase();
    const rule = TYPE_RULES[normalized];
    if (!rule) return err(new Error(`Unsupported data type abap.${kind}. Supported: ${SUPPORTED_ABAP_TYPES.join(', ')}`));

    // Length rules.
    if (rule.length === 'required' && length === null) return err(new Error(`abap.${normalized} requires a length, e.g. abap.${normalized}(10)`));
    if (rule.length === 'none' && length !== null && length !== rule.defaultLength) {
        return err(new Error(`abap.${normalized} has a fixed length of ${rule.defaultLength}`));
    }
    if (length !== null && length <= 0 && rule.length === 'required') return err(new Error(`abap.${normalized} length must be positive`));

    // Decimal rules.
    if (!rule.decimals && decimals !== null && decimals !== 0) return err(new Error(`abap.${normalized} does not take decimals`));
    const resolvedLength = length ?? rule.defaultLength;
    const resolvedDecimals = decimals ?? 0;
    if (resolvedDecimals > resolvedLength) return err(new Error(`abap.${normalized} decimals (${resolvedDecimals}) exceed length (${resolvedLength})`));

    return ok({ kind: normalized, length: resolvedLength, decimals: resolvedDecimals });
}

/**
 * Format a type as DSL text, e.g. abap.dec(13,2), abap.dats
 */
export function formatAbapType(type: AbapType): string {
    const rule = TYPE_RULES[type.kind];
    if (rule?.length === 'none') return `abap.${type.kind}`;
    if (rule?.decimals && type.decimals > 0) return `abap.${type.kind}(${type.length},${type.decimals})`;
    return `abap.${type.kind}(${type.length})`;
}

/**
 * Convert an ADT dataType code back to a type
 *
 * @param code - ADT code, e.g. 'CHAR'
 * @param length - Length from the document
 * @param decimals - Decimals from the document
 * @returns Type or error for an unsupported code
 */
export function abapTypeFromAdt(code: string, length: number, decimals: number): Result<AbapType, Error> {
    const kind = code.toLowerCase();
    if (!TYPE_RULES[kind]) return err(new Error(`Unsupported ADT data type ${code}`));
    return ok({ kind, length, decimals });
}
