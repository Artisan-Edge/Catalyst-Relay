/**
 * Unit Tests for DDIC ADT documents (build / parse / merge)
 *
 * XML fixtures are real GET responses captured from an S/4HANA system.
 */

import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import {
    buildDataElementXml,
    buildDomainXml,
    mergeDataElementXml,
    mergeDomainXml,
    parseDataElement,
    parseDataElementXml,
    parseDomain,
    parseDomainXml,
} from '../../../core/ddic';
import type { DataElementDef, DomainDef } from '../../../core/ddic';

const FIXTURES = path.join(import.meta.dir, '../../fixtures/ddic');
const META = { packageName: '$TMP', responsible: 'tester' };

function fixture(name: string): string {
    return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

describe('parseDomainXml', () => {
    it('reads fixed values', () => {
        const [def, error] = parseDomainXml(fixture('domain-fixed-values.xml'));
        expect(error).toBeNull();
        expect(def).toEqual({
            name: 'ZCATX_DDIC_DOMA',
            description: 'Catalyst DDIC test domain',
            dataType: { kind: 'char', length: 2, decimals: 0 },
            outputLength: 2,
            caseSensitive: false,
            signed: false,
            conversionRoutine: '',
            valueTable: '',
            fixedValues: [
                { low: 'A', high: '', text: 'Actual' },
                { low: 'P', high: '', text: 'Plan' },
            ],
        });
    });

    it('reads a conversion routine and a range', () => {
        const [def] = parseDomainXml(fixture('domain-conversion-range.xml'));
        expect(def?.dataType).toEqual({ kind: 'numc', length: 7, decimals: 0 });
        expect(def?.outputLength).toBe(8);
        expect(def?.conversionRoutine).toBe('ZCATX');
        expect(def?.fixedValues).toEqual([{ low: '0000001', high: '0000099', text: 'Range test' }]);
    });

    it('reads a value table', () => {
        const [def] = parseDomainXml(fixture('domain-value-table.xml'));
        expect(def?.valueTable).toBe('T001');
    });
});

describe('parseDataElementXml', () => {
    it('reads a domain-typed data element', () => {
        const [def, error] = parseDataElementXml(fixture('dataelement-domain.xml'));
        expect(error).toBeNull();
        expect(def).toEqual({
            name: 'ZCATX_DDIC_DTEL_D',
            description: 'Catalyst DDIC test ZCATX_DDIC_DTEL_D',
            dataType: null,
            domain: 'ZCATX_DDIC_DOMA',
            labels: { short: 'Short', medium: 'Medium label', long: 'Long label text', heading: 'Heading label' },
        });
    });

    it('reads a predefined-type data element', () => {
        const [def] = parseDataElementXml(fixture('dataelement-predefined.xml'));
        expect(def?.dataType).toEqual({ kind: 'dec', length: 13, decimals: 2 });
        expect(def?.domain).toBeNull();
    });
});

describe('build round-trip', () => {
    it('builds a domain document that parses back to the definition', () => {
        const [def] = parseDomain(fs.readFileSync(path.join(FIXTURES, 'zsnap_act_plan_source.asdoma'), 'utf8'));
        const [xml, error] = buildDomainXml(def!, META);
        expect(error).toBeNull();
        expect(xml).toContain('adtcore:responsible="TESTER"');
        expect(xml).toContain('<adtcore:packageRef adtcore:name="$TMP"/>');
        const [back] = parseDomainXml(xml!);
        expect(back).toEqual({ ...def!, name: 'ZSNAP_ACT_PLAN_SOURCE' });
    });

    it('sends an omitted output length as 0', () => {
        const [def] = parseDomain("@EndUserText.label: 'X'\ndefine domain zx { data type : abap.char(3); }");
        const [xml] = buildDomainXml(def!, META);
        expect(parseDomainXml(xml!)[0]?.outputLength).toBe(0);
    });

    it('builds data element documents for both type kinds', () => {
        for (const file of ['zsnap_fis_ktopl.asdtel', 'zsnap_signage.asdtel']) {
            const [def] = parseDataElement(fs.readFileSync(path.join(FIXTURES, file), 'utf8'));
            const [xml, error] = buildDataElementXml(def!, META);
            expect(error).toBeNull();
            expect(xml).toContain('<dtel:shortFieldLength>0</dtel:shortFieldLength>');
            const [back] = parseDataElementXml(xml!);
            expect(back).toEqual({
                ...def!,
                name: def!.name.toUpperCase(),
                domain: def!.domain?.toUpperCase() ?? null,
            });
        }
    });
});

describe('merge', () => {
    it('keeps fields the DSL does not model', () => {
        const serverXml = fixture('dataelement-domain.xml').replace('<dtel:setGetParameter/>', '<dtel:setGetParameter>BUK</dtel:setGetParameter>');
        const [current] = parseDataElementXml(serverXml);
        const updated: DataElementDef = { ...current!, labels: { ...current!.labels, short: 'Changed' } };
        const [xml, error] = mergeDataElementXml(serverXml, updated);
        expect(error).toBeNull();
        expect(xml).toContain('<dtel:setGetParameter>BUK</dtel:setGetParameter>');
        expect(xml).toContain('<dtel:shortFieldLabel>Changed</dtel:shortFieldLabel>');
        // Changed label re-derives its length; unchanged labels keep theirs.
        expect(xml).toContain('<dtel:shortFieldLength>0</dtel:shortFieldLength>');
        expect(xml).toContain('<dtel:mediumFieldLength>20</dtel:mediumFieldLength>');
    });

    it('switches a data element from domain to predefined type', () => {
        const serverXml = fixture('dataelement-domain.xml');
        const [current] = parseDataElementXml(serverXml);
        const updated: DataElementDef = { ...current!, domain: null, dataType: { kind: 'char', length: 4, decimals: 0 } };
        const [xml] = mergeDataElementXml(serverXml, updated);
        const [back] = parseDataElementXml(xml!);
        expect(back?.domain).toBeNull();
        expect(back?.dataType).toEqual({ kind: 'char', length: 4, decimals: 0 });
        expect(xml).toContain('<dtel:typeName/>');
    });

    it('replaces fixed values and keeps output length when omitted', () => {
        const serverXml = fixture('domain-fixed-values.xml');
        const [current] = parseDomainXml(serverXml);
        const updated: DomainDef = {
            ...current!,
            outputLength: null,
            valueTable: 'zcatx_tab',
            fixedValues: [{ low: 'X', high: '', text: 'Only' }],
        };
        const [xml, error] = mergeDomainXml(serverXml, updated);
        expect(error).toBeNull();
        const [back] = parseDomainXml(xml!);
        expect(back?.fixedValues).toEqual([{ low: 'X', high: '', text: 'Only' }]);
        expect(back?.outputLength).toBe(2);
        expect(back?.valueTable).toBe('ZCATX_TAB');
        expect(xml).toContain('<doma:position>0001</doma:position>');
        expect(xml).toContain('adtcore:uri="/sap/bc/adt/ddic/tables/zcatx_tab"');
        expect(xml).toContain('<doma:style>00</doma:style>');
    });

    it('clears a value table', () => {
        const serverXml = fixture('domain-value-table.xml');
        const [current] = parseDomainXml(serverXml);
        const [xml] = mergeDomainXml(serverXml, { ...current!, valueTable: '' });
        expect(parseDomainXml(xml!)[0]?.valueTable).toBe('');
        expect(xml).not.toContain('/sap/bc/adt/ddic/tables/t001');
    });
});
