/**
 * Token Cursor — recursive-descent helpers shared by the DSL parsers
 *
 * Methods throw DdicParseError; each parse entry point catches it once and
 * converts it to a Result.
 */

import type { Token } from './tokenize';
import { DdicParseError } from './types';
import { resolveAbapType } from './abapTypes';
import type { AbapType } from './types';

export class TokenCursor {
    private index = 0;

    constructor(private readonly tokens: Token[]) {}

    peek(offset = 0): Token {
        return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)]!;
    }

    next(): Token {
        const token = this.peek();
        if (this.index < this.tokens.length - 1) this.index++;
        return token;
    }

    fail(message: string, token: Token = this.peek()): never {
        const found = token.kind === 'eof' ? 'end of file' : `'${token.value}'`;
        throw new DdicParseError(`${message}, found ${found}`, token.line, token.column);
    }

    // True when the upcoming words match the given keywords (case-insensitive).
    isKeyword(...words: string[]): boolean {
        return words.every((word, offset) => {
            const token = this.peek(offset);
            return token.kind === 'word' && token.value.toLowerCase() === word;
        });
    }

    isPunct(value: string): boolean {
        const token = this.peek();
        return token.kind === 'punct' && token.value === value;
    }

    expectKeyword(...words: string[]): void {
        for (const word of words) {
            const token = this.peek();
            if (token.kind !== 'word' || token.value.toLowerCase() !== word) this.fail(`Expected '${words.join(' ')}'`);
            this.next();
        }
    }

    expectPunct(value: string): Token {
        if (!this.isPunct(value)) this.fail(`Expected '${value}'`);
        return this.next();
    }

    expectWord(what: string): Token {
        if (this.peek().kind !== 'word') this.fail(`Expected ${what}`);
        return this.next();
    }

    expectString(what: string): Token {
        if (this.peek().kind !== 'string') this.fail(`Expected ${what} in single quotes`);
        return this.next();
    }

    expectNumber(what: string): number {
        if (this.peek().kind !== 'number') this.fail(`Expected ${what}`);
        return Number(this.next().value);
    }

    expectEof(): void {
        if (this.peek().kind !== 'eof') this.fail('Expected end of file');
    }

    // abap.<kind>[ (length[, decimals]) ]
    parseAbapType(): AbapType {
        const start = this.peek();
        this.expectKeyword('abap');
        this.expectPunct('.');
        const kind = this.expectWord('an ABAP type after abap.').value;

        let length: number | null = null;
        let decimals: number | null = null;
        if (this.isPunct('(')) {
            this.next();
            length = this.expectNumber('a length');
            if (this.isPunct(',')) {
                this.next();
                decimals = this.expectNumber('decimals');
            }
            this.expectPunct(')');
        }

        const [type, typeErr] = resolveAbapType(kind, length, decimals);
        if (typeErr) throw new DdicParseError(typeErr.message, start.line, start.column);
        return type;
    }

    // @EndUserText.label: '<text>' annotations; returns the label (or null). Others are rejected.
    parseAnnotations(): string | null {
        let label: string | null = null;
        while (this.isPunct('@')) {
            const at = this.next();
            const parts = [this.expectWord('an annotation name').value];
            while (this.isPunct('.')) {
                this.next();
                parts.push(this.expectWord('an annotation name').value);
            }
            const name = parts.join('.');
            if (name.toLowerCase() !== 'endusertext.label') {
                throw new DdicParseError(`Unsupported annotation @${name} (only @EndUserText.label is supported)`, at.line, at.column);
            }
            this.expectPunct(':');
            label = this.expectString('the label text').value;
        }
        return label;
    }

    // Consume an optional ';' after a closing brace.
    skipOptionalSemicolon(): void {
        if (this.isPunct(';')) this.next();
    }
}
