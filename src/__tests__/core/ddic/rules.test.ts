/**
 * Unit Tests for DDIC validation and semantic equivalence
 */

import { describe, it, expect } from 'bun:test';
import {
    dataElementsEquivalent,
    domainsEquivalent,
    parseDataElement,
    parseDomain,
    validateDataElement,
    validateDomain,
} from '../../../core/ddic';
import type { DataElementDef, DomainDef } from '../../../core/ddic';

function dataElement(source: string): DataElementDef {
    const [def, error] = parseDataElement(source);
    if (error) throw error;
    return def;
}

function domain(source: string): DomainDef {
    const [def, error] = parseDomain(source);
    if (error) throw error;
    return def;
}

describe('validateDataElement', () => {
    it('accepts a valid definition', () => {
        const def = dataElement("define data element zx { data type : abap.char(1); labels { long : 'Long'; } }");
        expect(validateDataElement(def)[1]).toBeNull();
    });

    it('reports every violation', () => {
        const def = dataElement(`define data element ${'z'.repeat(31)} { data type : abap.char(1); labels { short : 'elevenchars'; } }`);
        const [, error] = validateDataElement(def);
        expect(error?.message).toContain('name exceeds 30');
        expect(error?.message).toContain('short label exceeds 10');
        expect(error?.message).toContain('needs an @EndUserText.label or a long label');
    });
});

describe('validateDomain', () => {
    it('requires a description', () => {
        const [, error] = validateDomain(domain('define domain zx { data type : abap.char(1); }'));
        expect(error?.message).toContain('needs an @EndUserText.label');
    });

    it('checks fixed values and conversion routine', () => {
        const def = domain(`@EndUserText.label: 'X'
define domain zx {
  data type : abap.char(1);
  conversion routine : TOOLONG;
  fixed values { 'A' : 'a'; 'A' : 'b'; 'AB' : 'c'; }
}`);
        const [, error] = validateDomain(def);
        expect(error?.message).toContain('conversion routine exceeds 5');
        expect(error?.message).toContain("duplicate fixed value 'A'");
        expect(error?.message).toContain("fixed value 'AB' is longer than the domain length (1)");
    });
});

describe('dataElementsEquivalent', () => {
    const local = dataElement("@EndUserText.label: 'Chart'\ndefine data element zx { data type : abap.char (4); labels { short : 'COA'; } }");

    it('ignores formatting and name case', () => {
        const remote = dataElement("@EndUserText.label: 'Chart'\ndefine data element ZX {\n\tdata type : abap.char(4);\n\tlabels {\n\t\tshort   : 'COA';\n\t}\n}");
        expect(dataElementsEquivalent(local, remote)).toBe(true);
    });

    it('detects a label change', () => {
        expect(dataElementsEquivalent(local, { ...local, labels: { ...local.labels, short: 'Other' } })).toBe(false);
    });

    it('compares only the domain for domain-typed elements', () => {
        const byDomain: DataElementDef = { ...local, dataType: null, domain: 'zdom' };
        const remote: DataElementDef = { ...byDomain, domain: 'ZDOM', dataType: { kind: 'char', length: 2, decimals: 0 } };
        expect(dataElementsEquivalent(byDomain, remote)).toBe(true);
        expect(dataElementsEquivalent(byDomain, { ...remote, domain: 'ZOTHER' })).toBe(false);
    });
});

describe('domainsEquivalent', () => {
    const local = domain("@EndUserText.label: 'X'\ndefine domain zx { data type : abap.numc(7); conversion routine : zfyp7; }");

    it('treats an omitted output length as matching', () => {
        expect(domainsEquivalent(local, { ...local, name: 'ZX', outputLength: 8, conversionRoutine: 'ZFYP7' })).toBe(true);
    });

    it('detects output length and fixed value changes', () => {
        const withLength: DomainDef = { ...local, outputLength: 7 };
        expect(domainsEquivalent(withLength, { ...local, outputLength: 8 })).toBe(false);
        expect(domainsEquivalent(local, { ...local, fixedValues: [{ low: 'A', high: '', text: 'a' }] })).toBe(false);
    });
});
