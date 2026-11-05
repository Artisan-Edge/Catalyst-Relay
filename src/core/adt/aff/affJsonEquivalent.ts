/**
 * AFF JSON Equivalent — compare two abap-file-formats JSON sources as values
 */

import { safeJsonParse } from '../../utils/json';
import { normalizeContent } from '../../utils/content';
import { stripBom } from '../../utils/bom';
import type { AffJsonRules } from '../types';
import { applyAffJsonRules } from './applyAffJsonRules';

/**
 * Same JSON value: key order, number formatting (1 vs 1.0), whitespace and a BOM are ignored.
 * With rules, keys SAP adds or drops on save are not differences (see AffJsonRules).
 * When either side is not JSON: a type with rules is never equal (a broken file must not read as
 * unchanged); otherwise falls back to whitespace-normalized text.
 */
export function affJsonEquivalent(local: string, remote: string, rules?: AffJsonRules): boolean {
    const [left, leftErr] = safeJsonParse(local);
    const [right, rightErr] = safeJsonParse(remote);
    if ((leftErr || rightErr) && rules) return false;
    if (leftErr || rightErr) return normalizeContent(stripBom(local)) === normalizeContent(stripBom(remote));
    if (!rules) return canonicalJson(left) === canonicalJson(right);

    const [ownedLocal, ownedRemote] = applyAffJsonRules(left, right, rules);
    return canonicalJson(ownedLocal) === canonicalJson(ownedRemote);
}

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
