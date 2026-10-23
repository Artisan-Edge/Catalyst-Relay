/**
 * Equivalent — semantic comparison of a local definition against the server's
 *
 * Used by upsert to report 'unchanged' without being fooled by formatting
 * (abap.char (4) vs abap.char(4), label padding, name case).
 */

import type { AbapType, DataElementDef, DomainDef, FixedValue } from './types';

/**
 * True when the server data element already matches the local definition
 */
export function dataElementsEquivalent(local: DataElementDef, remote: DataElementDef): boolean {
    if (!sameName(local.name, remote.name)) return false;
    if (local.description !== remote.description) return false;
    if (local.labels.short !== remote.labels.short) return false;
    if (local.labels.medium !== remote.labels.medium) return false;
    if (local.labels.long !== remote.labels.long) return false;
    if (local.labels.heading !== remote.labels.heading) return false;

    // Domain-typed: SAP fills in the domain's type on read, so compare the domain only.
    if (local.domain || remote.domain) return sameName(local.domain ?? '', remote.domain ?? '');
    return sameType(local.dataType, remote.dataType);
}

/**
 * True when the server domain already matches the local definition
 *
 * An omitted local output length matches whatever SAP derived.
 */
export function domainsEquivalent(local: DomainDef, remote: DomainDef): boolean {
    if (!sameName(local.name, remote.name)) return false;
    if (local.description !== remote.description) return false;
    if (!sameType(local.dataType, remote.dataType)) return false;
    if (local.outputLength !== null && local.outputLength !== remote.outputLength) return false;
    if (local.caseSensitive !== remote.caseSensitive || local.signed !== remote.signed) return false;
    if (!sameName(local.conversionRoutine, remote.conversionRoutine)) return false;
    if (!sameName(local.valueTable, remote.valueTable)) return false;
    return sameFixedValues(local.fixedValues, remote.fixedValues);
}

function sameName(a: string, b: string): boolean {
    return a.toUpperCase() === b.toUpperCase();
}

function sameType(a: AbapType | null, b: AbapType | null): boolean {
    if (!a || !b) return a === b;
    return a.kind === b.kind && a.length === b.length && a.decimals === b.decimals;
}

function sameFixedValues(a: FixedValue[], b: FixedValue[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((value, i) => value.low === b[i]!.low && value.high === b[i]!.high && value.text === b[i]!.text);
}
