/**
 * Unit Tests for the .asdtel / .asdoma DSL parsers and serializers
 *
 * Fixtures in __tests__/fixtures/ddic are copied from S4-Views/dictionary_objects.
 */

import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { parseDataElement, parseDomain, serializeDataElement, serializeDomain, DdicParseError } from '../../../core/ddic';

const FIXTURES = path.join(import.meta.dir, '../../fixtures/ddic');

function fixture(name: string): string {
    return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

function fixturesWith(extension: string): string[] {
    return fs.readdirSync(FIXTURES).filter(file => file.endsWith(extension));
}

// Compare DSL text ignoring layout: whitespace runs and space before '('.
function normalize(text: string): string {
    return text.replace(/\s+/g, ' ').replace(/\s+\(/g, '(').trim();
}

describe('parseDataElement', () => {
    it('parses a predefined-type data element', () => {
        const [def, error] = parseDataElement(fixture('zsnap_fis_ktopl.asdtel'));
        expect(error).toBeNull();
        expect(def).toEqual({
            name: 'zsnap_fis_ktopl',
            description: 'Chart of Accounts',
            dataType: { kind: 'char', length: 4, decimals: 0 },
            domain: null,
            labels: { short: 'COA', medium: 'Chart of Accounts', long: 'Chart of Accounts', heading: 'Chart of Accounts' },
        });
    });

    it('parses a domain-typed data element', () => {
        const [def, error] = parseDataElement(fixture('zsnap_fins_jahrper.asdtel'));
        expect(error).toBeNull();
        expect(def?.domain).toBe('zsnap_fins_jahrper');
        expect(def?.dataType).toBeNull();
        expect(def?.labels.short).toBe('Year/Per');
    });

    it('falls back to the long label when there is no @EndUserText.label', () => {
        const source = "define data element zx { data type : abap.dec(13,2); labels { long : 'Long text'; } }";
        const [def] = parseDataElement(source);
        expect(def?.description).toBe('Long text');
        expect(def?.dataType).toEqual({ kind: 'dec', length: 13, decimals: 2 });
    });

    it("handles comments, '' escapes and fixed-length types", () => {
        const source = [
            '// leading comment',
            "@EndUserText.label: 'Owner''s date'",
            'define data element zx { /* block */ data type : abap.dats; }',
        ].join('\n');
        const [def, error] = parseDataElement(source);
        expect(error).toBeNull();
        expect(def?.description).toBe("Owner's date");
        expect(def?.dataType).toEqual({ kind: 'dats', length: 8, decimals: 0 });
    });

    it('rejects both data type and domain', () => {
        const [, error] = parseDataElement('define data element zx { data type : abap.char(1); domain : zd; }');
        expect(error).toBeInstanceOf(DdicParseError);
        expect(error?.message).toContain("Only one 'data type' or 'domain'");
    });

    it('rejects a missing type clause', () => {
        const [, error] = parseDataElement("define data element zx { labels { short : 'a'; } }");
        expect(error?.message).toContain("Expected a 'data type");
    });

    it('rejects unsupported annotations with a position', () => {
        const [, error] = parseDataElement("@Semantics.amount: true\ndefine data element zx { data type : abap.char(1); }");
        expect(error?.message).toContain('Unsupported annotation @Semantics.amount');
        expect(error?.line).toBe(1);
        expect(error?.column).toBe(1);
    });

    it('reports unterminated strings with line and column', () => {
        const [, error] = parseDataElement("define data element zx {\n  labels { short : 'oops; }\n}");
        expect(error?.message).toContain('Unterminated string');
        expect(error?.line).toBe(2);
        expect(error?.column).toBe(20);
    });

    it('rejects type-rule violations', () => {
        expect(parseDataElement('define data element zx { data type : abap.char; }')[1]?.message).toContain('requires a length');
        expect(parseDataElement('define data element zx { data type : abap.char(4,2); }')[1]?.message).toContain('does not take decimals');
        expect(parseDataElement('define data element zx { data type : abap.dats(10); }')[1]?.message).toContain('fixed length of 8');
        expect(parseDataElement('define data element zx { data type : abap.foo(1); }')[1]?.message).toContain('Unsupported data type');
    });
});

describe('parseDomain', () => {
    it('parses fixed values', () => {
        const [def, error] = parseDomain(fixture('zsnap_act_plan_source.asdoma'));
        expect(error).toBeNull();
        expect(def?.dataType).toEqual({ kind: 'char', length: 2, decimals: 0 });
        expect(def?.outputLength).toBe(2);
        expect(def?.fixedValues).toEqual([
            { low: 'A', high: '', text: 'Actual' },
            { low: 'P', high: '', text: 'Plan' },
            { low: 'AS', high: '', text: 'Actual Summarized' },
            { low: 'PS', high: '', text: 'Plan Summarized' },
        ]);
    });

    it('parses a conversion routine', () => {
        const [def] = parseDomain(fixture('zsnap_fins_jahrper.asdoma'));
        expect(def?.dataType).toEqual({ kind: 'numc', length: 7, decimals: 0 });
        expect(def?.outputLength).toBe(8);
        expect(def?.conversionRoutine).toBe('ZFYP7');
    });

    it('parses flags, value table and ranges in any order', () => {
        const source = `@EndUserText.label: 'Flags'
define domain zx {
  value table : t001;
  sign;
  data type : abap.dec(10,2);
  case sensitive;
  fixed values {
    '1' to '9' : 'Digits';
  }
}`;
        const [def, error] = parseDomain(source);
        expect(error).toBeNull();
        expect(def).toMatchObject({ signed: true, caseSensitive: true, valueTable: 't001', outputLength: null });
        expect(def?.fixedValues).toEqual([{ low: '1', high: '9', text: 'Digits' }]);
    });

    it('rejects duplicate clauses and a missing data type', () => {
        expect(parseDomain('define domain zx { sign; sign; data type : abap.int4; }')[1]?.message).toContain("Duplicate 'sign'");
        expect(parseDomain('define domain zx { sign; }')[1]?.message).toContain("Expected a 'data type");
    });
});

describe('serializers', () => {
    for (const file of fixturesWith('.asdtel')) {
        it(`round-trips ${file}`, () => {
            const source = fixture(file);
            const [def] = parseDataElement(source);
            const text = serializeDataElement(def!);
            expect(parseDataElement(text)[0]).toEqual(def!);
            expect(normalize(text)).toBe(normalize(source));
        });
    }

    for (const file of fixturesWith('.asdoma')) {
        it(`round-trips ${file}`, () => {
            const source = fixture(file);
            const [def] = parseDomain(source);
            const text = serializeDomain(def!);
            expect(parseDomain(text)[0]).toEqual(def!);
            expect(normalize(text)).toBe(normalize(source));
        });
    }

    it('emits canonical layout', () => {
        const [def] = parseDomain("@EndUserText.label: 'It''s'\ndefine domain ZX { data type : abap.char (1); fixed values { 'A' to 'C' : 'Range'; } }");
        expect(serializeDomain(def!)).toBe(
            "@EndUserText.label: 'It''s'\ndefine domain zx {\n\tdata type : abap.char(1);\n\tfixed values {\n\t\t'A' to 'C' : 'Range';\n\t}\n}\n",
        );
    });
});
