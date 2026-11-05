/**
 * Content normalization utilities
 *
 * Used for comparing object content between server and local versions.
 * SAP returns CRLF line ends and drops trailing blanks; CDS sources are also re-laid out on activation.
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

/**
 * Normalize source text line by line for comparison (ABAP, where spacing is significant)
 *
 * Drops a leading BOM, makes line ends LF, strips trailing whitespace from each line and
 * drops trailing blank lines. Everything else, indentation included, is kept.
 *
 * @param content - Raw source
 * @returns Canonical form; equal for sources that differ only in line ends and trailing blanks
 */
export function normalizeSourceLines(content: string): string {
    const lines = stripBom(content).split(/\r\n|\r|\n/).map(line => line.trimEnd());
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
}

// CDS separators: whitespace next to one is insignificant (`label : 'x'` = `label: 'x'`, `char( 10 )` = `char(10)`).
// Arithmetic signs and `/` are excluded (`--` and `//` start comments; `/` is part of namespaced names).
const CDS_SEPARATORS = new Set([':', ';', ',', '.', '{', '}', '(', ')', '[', ']', '=', '<', '>']);

// Whitespace between these is kept, since removing it would form an operator (`< =` is not `<=`, `= >` is not `=>`)
const CDS_OPERATOR_FIRSTS = new Set(['<', '>', '!', '=', '-']);
const CDS_OPERATOR_SECONDS = new Set(['=', '>', '<']);

// Ends a line comment in normalized output, so code after it never reads as part of the comment
const LINE_COMMENT_END = '\n';

const WHITESPACE = /\s/;

// String types SAP reads back with a length of 0 (lower case; matched case-insensitively)
const ZERO_LENGTH_SUFFIX = '(0';
const ZERO_LENGTH_STRING_TYPES = ['abap.string', 'abap.rawstring'].map(type => type + ZERO_LENGTH_SUFFIX);
const IDENTIFIER_CHAR = /[A-Za-z0-9_/]/;

/**
 * Normalize CDS-language source (DDL, DCL, BDL, SDL) for comparison
 *
 * Like normalizeContent, and also drops whitespace next to a separator, so SAP's re-layout on
 * activation (`label : 'x'`, aligned `key a      : t`) is no change. Quoted literals are kept
 * verbatim (a doubled '' reads as two adjacent literals, so it is kept too); whitespace inside
 * comments is collapsed. Case is kept. `abap.string(0)` / `abap.rawstring(0)` in code read as
 * `abap.string` / `abap.rawstring`, as SAP stores them. Backslashes are not treated as escapes:
 * callers compare sources containing one strictly (see contentEquivalent).
 *
 * @param content - Raw CDS source
 * @returns Canonical form; equal for sources that differ only in insignificant whitespace
 */
export function normalizeCdsContent(content: string): string {
    const source = stripBom(content);
    const out: string[] = [];
    let last = '';
    let pendingSpace = false;
    let i = 0;
    while (i < source.length) {
        if (WHITESPACE.test(source[i]!)) {
            pendingSpace = true;
            i++;
            continue;
        }
        const [token, next] = readCdsToken(source, i);
        pendingSpace = pendingSpace && Boolean(last) && keepsSpace(last, token[0]!);
        i = next;

        // SAP stores abap.string / abap.rawstring as abap.string(0) / abap.rawstring(0): drop the "(0"
        if (token === ')' && endsWithZeroLengthStringType(out)) {
            out.length -= ZERO_LENGTH_SUFFIX.length;
            last = out[out.length - 1]?.slice(-1) ?? '';
            pendingSpace = false;
            continue;
        }

        if (pendingSpace) out.push(' ');
        out.push(token);
        last = token[token.length - 1]!;
        pendingSpace = false;
    }
    return out.join('');
}

// Code tokens are single characters; literals, comments and kept spaces never match these
function endsWithZeroLengthStringType(out: string[]): boolean {
    return ZERO_LENGTH_STRING_TYPES.some(type => {
        if (out.length < type.length) return false;
        const tail = out.slice(-type.length);
        if (tail.some(token => token.length !== 1)) return false;
        if (tail.join('').toLowerCase() !== type) return false;
        const before = out[out.length - type.length - 1];
        return before === undefined || before.length !== 1 || !IDENTIFIER_CHAR.test(before);
    });
}

// Next token at start (not whitespace): a literal, a comment, or one character; returns it and the index after it
function readCdsToken(source: string, start: number): [string, number] {
    const pair = source.slice(start, start + 2);
    if (source[start] === "'") {
        const close = source.indexOf("'", start + 1);
        const end = close === -1 ? source.length : close + 1;
        return [source.slice(start, end), end];
    }
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
