/**
 * Content normalization utilities
 *
 * Used for comparing object content between server and local versions.
 * SAP returns CRLF line ends and drops trailing blanks; DDIC tables and structures are also re-laid out on activation.
 * Only ASCII whitespace counts as whitespace: NBSP, a BOM after the first character, U+2028, U+3000 etc. are content.
 */

import { stripBom } from './bom';

const ASCII_WHITESPACE_RUNS = /[ \t\r\n\f\v]+/g;
const ASCII_WHITESPACE = /[ \t\r\n\f\v]/;

/**
 * Normalize content for comparison
 *
 * Drops a leading BOM, replaces every run of ASCII whitespace (spaces, tabs, newlines,
 * carriage returns, form feeds, vertical tabs) with a single space, and trims.
 *
 * @param content - Raw content string
 * @returns Normalized content with single spaces
 */
export function normalizeContent(content: string): string {
    return collapse(stripBom(content));
}

/**
 * Normalize source text line by line for comparison (ABAP, where spacing is significant)
 *
 * Drops a leading BOM, makes line ends LF (CRLF, CR), strips trailing spaces and tabs from
 * each line and drops trailing blank lines. Everything else, indentation included, is kept.
 *
 * @param content - Raw source
 * @returns Canonical form; equal for sources that differ only in line ends and trailing blanks
 */
export function normalizeSourceLines(content: string): string {
    const lines = stripBom(content).split(/\r\n|\r|\n/).map(stripTrailingBlanks);
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
}

// Trailing spaces and tabs (a loop, not /[ \t]+$/, which backtracks on long inner runs)
function stripTrailingBlanks(line: string): string {
    let end = line.length;
    while (end > 0 && (line[end - 1] === ' ' || line[end - 1] === '\t')) end--;
    return line.slice(0, end);
}

// CDS separators: whitespace next to one is insignificant (`label : 'x'` = `label: 'x'`, `char( 10 )` = `char(10)`).
// Arithmetic signs and `/` are excluded (`--` and `//` start comments; `/` is part of namespaced names).
const CDS_SEPARATORS = new Set([':', ';', ',', '.', '{', '}', '(', ')', '[', ']', '=', '<', '>']);

// Whitespace between these is kept, since removing it would form an operator (`< =` is not `<=`, `= >` is not `=>`)
const CDS_OPERATOR_FIRSTS = new Set(['<', '>', '!', '=', '-']);
const CDS_OPERATOR_SECONDS = new Set(['=', '>', '<']);

// Ends a line comment in normalized output, so code after it never reads as part of the comment
const LINE_COMMENT_END = '\n';

// String types SAP reads back with a length of 0 (lower case; matched case-insensitively)
const ZERO_LENGTH_SUFFIX = '(0';
const ZERO_LENGTH_STRING_TYPES = ['abap.string', 'abap.rawstring'].map(type => type + ZERO_LENGTH_SUFFIX);
// A type preceded by one of these is part of a longer name or path (zabap.string, x.abap.string)
const NAME_CHAR = /[A-Za-z0-9_/.]/;

/**
 * Normalize CDS-language source (DDIC table / structure DDL) for comparison
 *
 * Like normalizeContent, and also drops whitespace next to a separator, so SAP's re-layout on
 * activation (`label : 'x'`, aligned `key a      : t`) is no change. Quoted literals are kept
 * verbatim (a doubled '' reads as two adjacent literals, so it is kept too); whitespace inside
 * comments is collapsed. Case is kept. One `(0)` after `abap.string` / `abap.rawstring` in code is
 * dropped, as SAP stores the bare types with length 0.
 *
 * @param content - Raw CDS source
 * @param backslashEscapes - Read a backslash in a literal as escaping the next character
 * @returns Canonical form; equal for sources that differ only in insignificant whitespace
 */
export function normalizeCdsContent(content: string, backslashEscapes = false): string {
    const source = stripBom(content);
    const out: string[] = [];
    let last = '';
    let pendingSpace = false;
    // out.length right after the last "(0)" drop; a type gets at most one
    let droppedAt = -1;
    let i = 0;
    while (i < source.length) {
        if (ASCII_WHITESPACE.test(source[i]!)) {
            pendingSpace = true;
            i++;
            continue;
        }
        const [token, next] = readCdsToken(source, i, backslashEscapes);
        i = next;

        // SAP stores abap.string / abap.rawstring as abap.string(0) / abap.rawstring(0): drop the "(0)",
        // keeping the token boundary it stood for (`abap.string(0)not null` = `abap.string not null`)
        if (token === ')' && out.length - ZERO_LENGTH_SUFFIX.length !== droppedAt && endsWithZeroLengthStringType(out)) {
            out.length -= ZERO_LENGTH_SUFFIX.length;
            droppedAt = out.length;
            last = out[out.length - 1]!.slice(-1);
            pendingSpace = true;
            continue;
        }

        if (pendingSpace && last && keepsSpace(last, token[0]!)) out.push(' ');
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
        return before === undefined || before.length !== 1 || !NAME_CHAR.test(before);
    });
}

// Next token at start (not whitespace): a literal, a comment, or one character; returns it and the index after it
function readCdsToken(source: string, start: number, backslashEscapes: boolean): [string, number] {
    const pair = source.slice(start, start + 2);
    if (source[start] === "'") {
        const end = literalEnd(source, start, backslashEscapes);
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

// Index after the literal's closing quote; a literal never spans lines, so an unclosed one ends at the line end
function literalEnd(source: string, start: number, backslashEscapes: boolean): number {
    let i = start + 1;
    while (i < source.length) {
        const char = source[i];
        if (char === "'") return i + 1;
        if (char === '\r' || char === '\n') return i;
        i += backslashEscapes && char === '\\' && source[i + 1] !== '\r' && source[i + 1] !== '\n' ? 2 : 1;
    }
    return source.length;
}

function findLineEnd(source: string, start: number): number {
    const lineEnd = /[\r\n]/g;
    lineEnd.lastIndex = start;
    return lineEnd.exec(source)?.index ?? source.length;
}

function collapse(text: string): string {
    const collapsed = text.replace(ASCII_WHITESPACE_RUNS, ' ');
    const start = collapsed.startsWith(' ') ? 1 : 0;
    const end = collapsed.endsWith(' ') ? collapsed.length - 1 : collapsed.length;
    return start < end ? collapsed.slice(start, end) : '';
}

function keepsSpace(previous: string, next: string): boolean {
    if (previous === LINE_COMMENT_END) return false;
    if (CDS_OPERATOR_FIRSTS.has(previous) && CDS_OPERATOR_SECONDS.has(next)) return true;
    return !CDS_SEPARATORS.has(previous) && !CDS_SEPARATORS.has(next);
}
