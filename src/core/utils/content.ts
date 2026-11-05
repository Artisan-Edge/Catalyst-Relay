/**
 * Content normalization utilities
 *
 * Used for comparing object content between server and local versions.
 * SAP servers may insert whitespace variations (carriage returns, extra spaces)
 * that shouldn't be considered meaningful differences.
 */

import { stripBom } from './bom';

/**
 * Normalize content for comparison
 *
 * Drops a leading BOM, replaces all consecutive whitespace (spaces, tabs, newlines,
 * carriage returns) with a single space. Trims leading/trailing whitespace.
 *
 * @param content - Raw content string
 * @returns Normalized content with single spaces
 */
export function normalizeContent(content: string): string {
    return stripBom(content).replace(/\s+/g, ' ').trim();
}

// CDS separators: whitespace next to one is insignificant (`label : 'x'` = `label: 'x'`, `char( 10 )` = `char(10)`).
// Arithmetic signs and `/` are excluded (`--` and `//` start comments; `/` is part of namespaced names).
const CDS_SEPARATORS = new Set([':', ';', ',', '.', '{', '}', '(', ')', '[', ']', '=', '<', '>']);

// Whitespace between these is kept, since removing it would form an operator (`< =` is not `<=`)
const CDS_OPERATOR_FIRSTS = new Set(['<', '>', '!']);
const CDS_OPERATOR_SECONDS = new Set(['=', '>']);

// Ends a line comment in normalized output, so code after it never reads as part of the comment
const LINE_COMMENT_END = '\n';

/**
 * Normalize CDS-language source (DDL, DCL, BDL, SDL) for comparison
 *
 * Like normalizeContent, and also drops whitespace next to a separator, so SAP's pretty-printing
 * on save (`label : 'x'`, aligned `key a      : t`) is no change. String literals are kept verbatim;
 * whitespace inside comments is collapsed. Case is kept.
 *
 * @param content - Raw CDS source
 * @returns Canonical form; equal for sources that differ only in insignificant whitespace
 */
export function normalizeCdsContent(content: string): string {
    const source = stripBom(content);
    let out = '';
    let pendingSpace = false;
    let i = 0;
    while (i < source.length) {
        if (/\s/.test(source[i]!)) {
            pendingSpace = true;
            i++;
            continue;
        }
        const [token, next] = readCdsToken(source, i);
        if (pendingSpace && out && keepsSpace(out[out.length - 1]!, token[0]!)) out += ' ';
        out += token;
        pendingSpace = false;
        i = next;
    }
    return out;
}

// Next token at start (not whitespace): a literal, a comment, or one character; returns it and the index after it
function readCdsToken(source: string, start: number): [string, number] {
    const pair = source.slice(start, start + 2);
    if (source[start] === "'") return readLiteral(source, start);
    if (pair === '//' || pair === '--') {
        const end = findLineEnd(source, start);
        return [collapse(source.slice(start, end)) + LINE_COMMENT_END, end];
    }
    if (pair === '/*') {
        const close = source.indexOf('*/', start + 2);
        const end = close === -1 ? source.length : close + 2;
        return [collapse(source.slice(start, end)), end];
    }
    return [source[start]!, start + 1];
}

// Quoted literal, verbatim; a backslash escapes the next character
function readLiteral(source: string, start: number): [string, number] {
    let i = start + 1;
    while (i < source.length && source[i] !== "'") i += source[i] === '\\' ? 2 : 1;
    const end = Math.min(i + 1, source.length);
    return [source.slice(start, end), end];
}

function findLineEnd(source: string, start: number): number {
    const lineEnd = /[\r\n]/g;
    lineEnd.lastIndex = start;
    return lineEnd.exec(source)?.index ?? source.length;
}

function collapse(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

function keepsSpace(previous: string, next: string): boolean {
    if (previous === LINE_COMMENT_END) return false;
    if (CDS_OPERATOR_FIRSTS.has(previous) && CDS_OPERATOR_SECONDS.has(next)) return true;
    return !CDS_SEPARATORS.has(previous) && !CDS_SEPARATORS.has(next);
}
