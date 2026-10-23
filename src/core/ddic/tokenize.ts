/**
 * Tokenize — lexer for .asdtel / .asdoma sources
 */

import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';
import { DdicParseError } from './types';

export type TokenKind = 'word' | 'string' | 'number' | 'punct' | 'eof';

export interface Token {
    kind: TokenKind;
    value: string;
    line: number;
    column: number;
}

const PUNCTUATION = new Set(['{', '}', ':', ';', '(', ')', ',', '.', '@']);
const WORD_START = /[A-Za-z_/]/;
const WORD_PART = /[A-Za-z0-9_/]/;
const DIGIT = /[0-9]/;

/**
 * Split source text into tokens, skipping whitespace and comments
 *
 * Strings are single-quoted with '' as an escaped quote and may not span lines.
 * Words include namespace slashes (/ABC/NAME).
 *
 * @param source - DSL source
 * @returns Tokens ending with an eof token, or a positioned error
 */
export function tokenize(source: string): Result<Token[], DdicParseError> {
    const tokens: Token[] = [];
    let i = 0;
    let line = 1;
    let column = 1;

    const advance = (count: number): void => {
        for (let n = 0; n < count; n++) {
            if (source[i] === '\n') {
                line++;
                column = 1;
            } else {
                column++;
            }
            i++;
        }
    };

    while (i < source.length) {
        const ch = source[i]!;
        const next = source[i + 1];

        // Whitespace.
        if (/\s/.test(ch)) {
            advance(1);
            continue;
        }

        // Line comment.
        if (ch === '/' && next === '/') {
            while (i < source.length && source[i] !== '\n') advance(1);
            continue;
        }

        // Block comment.
        if (ch === '/' && next === '*') {
            const startLine = line;
            const startColumn = column;
            advance(2);
            while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) advance(1);
            if (i >= source.length) return err(new DdicParseError('Unterminated block comment', startLine, startColumn));
            advance(2);
            continue;
        }

        // Quoted string with '' escapes.
        if (ch === "'") {
            const startLine = line;
            const startColumn = column;
            advance(1);
            let value = '';
            for (;;) {
                const c = source[i];
                if (c === undefined || c === '\n') return err(new DdicParseError('Unterminated string', startLine, startColumn));
                if (c === "'" && source[i + 1] === "'") {
                    value += "'";
                    advance(2);
                    continue;
                }
                if (c === "'") {
                    advance(1);
                    break;
                }
                value += c;
                advance(1);
            }
            tokens.push({ kind: 'string', value, line: startLine, column: startColumn });
            continue;
        }

        // Number.
        if (DIGIT.test(ch)) {
            const start = i;
            const startColumn = column;
            while (i < source.length && DIGIT.test(source[i]!)) advance(1);
            tokens.push({ kind: 'number', value: source.slice(start, i), line, column: startColumn });
            continue;
        }

        // Word (keywords and names, including /NS/ prefixes).
        if (WORD_START.test(ch)) {
            const start = i;
            const startColumn = column;
            while (i < source.length && WORD_PART.test(source[i]!)) advance(1);
            tokens.push({ kind: 'word', value: source.slice(start, i), line, column: startColumn });
            continue;
        }

        // Punctuation.
        if (PUNCTUATION.has(ch)) {
            tokens.push({ kind: 'punct', value: ch, line, column });
            advance(1);
            continue;
        }

        return err(new DdicParseError(`Unexpected character '${ch}'`, line, column));
    }

    tokens.push({ kind: 'eof', value: '', line, column });
    return ok(tokens);
}
