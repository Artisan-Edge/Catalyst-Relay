/**
 * Unit Tests for Content Normalization
 *
 * Tests content normalization used to compare server vs local content:
 * - Whitespace normalization (spaces, tabs, newlines, carriage returns)
 * - Edge cases (empty strings, single characters)
 * - CDS sources: whitespace next to separators ignored, literals verbatim
 */

import { describe, it, expect } from 'bun:test';
import { normalizeContent, normalizeCdsContent } from '../../../core/utils/content';

describe('normalizeContent', () => {
    describe('whitespace normalization', () => {
        it('should replace multiple spaces with single space', () => {
            const input = 'hello    world';
            const result = normalizeContent(input);
            expect(result).toBe('hello world');
        });

        it('should replace tabs with single space', () => {
            const input = 'hello\t\tworld';
            const result = normalizeContent(input);
            expect(result).toBe('hello world');
        });

        it('should replace newlines with single space', () => {
            const input = 'hello\n\nworld';
            const result = normalizeContent(input);
            expect(result).toBe('hello world');
        });

        it('should replace carriage returns with single space', () => {
            const input = 'hello\r\rworld';
            const result = normalizeContent(input);
            expect(result).toBe('hello world');
        });

        it('should replace Windows line endings (CRLF) with single space', () => {
            const input = 'hello\r\n\r\nworld';
            const result = normalizeContent(input);
            expect(result).toBe('hello world');
        });

        it('should replace mixed whitespace with single space', () => {
            const input = 'hello \t \n \r world';
            const result = normalizeContent(input);
            expect(result).toBe('hello world');
        });

        it('should trim leading whitespace', () => {
            const input = '   hello world';
            const result = normalizeContent(input);
            expect(result).toBe('hello world');
        });

        it('should trim trailing whitespace', () => {
            const input = 'hello world   ';
            const result = normalizeContent(input);
            expect(result).toBe('hello world');
        });

        it('should trim leading and trailing whitespace', () => {
            const input = '\n\t  hello world  \t\n';
            const result = normalizeContent(input);
            expect(result).toBe('hello world');
        });
    });

    describe('edge cases', () => {
        it('should return empty string for empty input', () => {
            const result = normalizeContent('');
            expect(result).toBe('');
        });

        it('should return empty string for whitespace-only input', () => {
            const result = normalizeContent('   \t\n\r   ');
            expect(result).toBe('');
        });

        it('should preserve single word without changes', () => {
            const result = normalizeContent('hello');
            expect(result).toBe('hello');
        });

        it('should preserve content with no extra whitespace', () => {
            const input = 'hello world foo bar';
            const result = normalizeContent(input);
            expect(result).toBe('hello world foo bar');
        });
    });

    describe('realistic SAP content scenarios', () => {
        it('should normalize ABAP source code with different line endings', () => {
            const serverContent = 'REPORT ztest.\r\n\r\nWRITE: / \'Hello\'.\r\n';
            const localContent = 'REPORT ztest.\n\nWRITE: / \'Hello\'.\n';

            expect(normalizeContent(serverContent)).toBe(normalizeContent(localContent));
        });

        it('should normalize CDS view with indentation differences', () => {
            const serverContent = '@AbapCatalog.sqlViewName:\t\'ZVIEW\'\ndefine view ZMyView';
            const localContent = '@AbapCatalog.sqlViewName:  \'ZVIEW\'\ndefine view ZMyView';

            expect(normalizeContent(serverContent)).toBe(normalizeContent(localContent));
        });

        it('should detect actual content differences after normalization', () => {
            const serverContent = 'REPORT ztest.\nWRITE: / \'Hello\'.';
            const localContent = 'REPORT ztest.\nWRITE: / \'World\'.';

            expect(normalizeContent(serverContent)).not.toBe(normalizeContent(localContent));
        });
    });
});

describe('normalizeCdsContent', () => {
    const same = (a: string, b: string) => expect(normalizeCdsContent(a)).toBe(normalizeCdsContent(b));
    const differs = (a: string, b: string) => expect(normalizeCdsContent(a)).not.toBe(normalizeCdsContent(b));

    it('treats a table SAP pretty-printed on save as unchanged', () => {
        const local = "@EndUserText.label: 'Valid CDS to Table mapping'\n@AbapCatalog.enhancement.category: #NOT_EXTENSIBLE\ndefine table zsnap_c2t_map {\n\tkey mandt: mandt not null;\n\tkey cds_name: ddlname not null;\n\ttab_name: abap.char(30);\n}\n";
        const sap = "@EndUserText.label : 'Valid CDS to Table mapping'\r\n@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE\r\ndefine table zsnap_c2t_map {\r\n\r\n  key mandt      : mandt not null;\r\n  key cds_name   : ddlname not null;\r\n  tab_name       : abap.char( 30 );\r\n\r\n}";
        same(`﻿${local}`, sap);
    });

    it('keeps string literals verbatim', () => {
        differs("@EndUserText.label: 'a : b'", "@EndUserText.label: 'a: b'");
        differs("label: 'a  b'", "label: 'a b'");
        differs("label: '// x : y'", "label: '// x: y'");
        same("label : 'it\\'s ; x'", "label: 'it\\'s ; x'");
    });

    it('detects a real token change', () => {
        differs('key mandt : mandt not null;', 'key mandt : mandt;');
        differs('key mandt : mandt not null;', 'key mandt : mandt notnull;');
        differs('abap.char( 30 )', 'abap.char( 31 )');
    });

    it('keeps the space that separates two words', () => {
        same('define  table\n z', 'define table z');
        differs('define table z', 'definetable z');
    });

    it('does not join the halves of an operator', () => {
        same('a<=b', 'a <= b');
        differs('a < = b', 'a <= b');
        differs('a ! = b', 'a != b');
    });

    it('does not let code move into a line comment', () => {
        differs('// note\n}', '// note }');
        differs('// note\n}', '// note}');
        same('//  note  \n  }', '// note\r\n}');
        same('/*  a\n b */ key', '/* a b */\nkey');
    });
});
