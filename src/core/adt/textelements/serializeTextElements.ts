// Serialize text pool entries to the ADT text format

import type { Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { TextElementEntry, TextElementsPart } from './types';
import { parseTextElements, HEADING_KEYS } from './parseTextElements';

// Selection names are padded to the 8-character SELECT-OPTIONS / PARAMETERS name width, as SAP does
const SELECTION_NAME_WIDTH = 8;

/**
 * Entries back to text, in the given order: blocks separated by a blank line (column headings
 * stay together under the list header, as SAP serves them).
 */
export function serializeTextElements(part: TextElementsPart, entries: readonly TextElementEntry[], eol = '\n'): string {
    if (part === 'headings') return serializeHeadings(entries, eol);

    return entries
        .map(entry => part === 'symbols' ? symbolBlock(entry, eol) : selectionBlock(entry, eol))
        .join(`${eol}${eol}`);
}

/**
 * Comparable form of a part's text: placeholders dropped, entries sorted by key, DDIC-referenced
 * selection texts blanked (SAP fills those from the DDIC), LF line endings.
 */
export function canonicalTextElements(part: TextElementsPart, text: string): Result<string, Error> {
    const [entries, parseError] = parseTextElements(part, text);
    if (parseError) return err(parseError);

    const canonical = entries
        .map(entry => entry.ddicReference ? { ...entry, text: '' } : entry)
        .sort((a, b) => sortKey(part, a.key) - sortKey(part, b.key) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return ok(serializeTextElements(part, canonical));
}

/**
 * Whether two texts of a part hold the same entries (order, line endings and blank lines ignored)
 */
export function textElementsEquivalent(part: TextElementsPart, a: string, b: string): Result<boolean, Error> {
    const [left, leftError] = canonicalTextElements(part, a);
    if (leftError) return err(leftError);
    const [right, rightError] = canonicalTextElements(part, b);
    if (rightError) return err(rightError);
    return ok(left === right);
}

function symbolBlock(entry: TextElementEntry, eol: string): string {
    const line = `${entry.key}=${entry.text}`;
    return entry.maxLength === undefined ? line : `@MaxLength:${entry.maxLength}${eol}${line}`;
}

function selectionBlock(entry: TextElementEntry, eol: string): string {
    const line = `${entry.key.padEnd(SELECTION_NAME_WIDTH)}=${entry.text}`;
    return entry.ddicReference ? `@DDICReference${eol}${line}` : line;
}

function serializeHeadings(entries: readonly TextElementEntry[], eol: string): string {
    const list = entries.filter(entry => entry.key === 'listHeader').map(entry => `${entry.key}=${entry.text}`);
    const columns = entries.filter(entry => entry.key !== 'listHeader').map(entry => `${entry.key}=${entry.text}`);
    return [list.join(eol), columns.join(eol)].filter(block => block !== '').join(`${eol}${eol}`);
}

// Headings keep their fixed order; other parts sort by key alone
function sortKey(part: TextElementsPart, key: string): number {
    return part === 'headings' ? HEADING_KEYS.indexOf(key as typeof HEADING_KEYS[number]) : 0;
}
