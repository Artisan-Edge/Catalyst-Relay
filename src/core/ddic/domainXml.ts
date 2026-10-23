/**
 * Domain XML — DomainDef ↔ ADT document (application/vnd.sap.adt.domains.v2+xml)
 *
 * build, parse and merge are kept together: build is merge applied to a blank
 * skeleton, so create and update share one field mapping.
 */

import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';
import { escapeXml, safeParseXml } from '../utils/xml';
import type { DdicObjectMeta, DomainDef, FixedValue } from './types';
import { abapTypeFromAdt } from './abapTypes';
import { ADTCORE_NS, childNumber, childText, padNumber, requireChild, serializeXml, setChildText, setText } from './xmlDom';

const DOMA_NS = 'http://www.sap.com/dictionary/domain';
const NUMBER_WIDTH = 6;
const POSITION_WIDTH = 4;
const VALUE_TABLE_TYPE = 'TABL/DT';
const VALUE_TABLE_ATTRIBUTES = ['uri', 'type', 'name'];

/**
 * Build the create document for a domain
 *
 * An omitted output length is sent as 0; SAP derives it on activation.
 *
 * @param def - Domain definition
 * @param meta - Package and responsible user
 * @returns XML body for POST /sap/bc/adt/ddic/domains
 */
export function buildDomainXml(def: DomainDef, meta: DdicObjectMeta): Result<string, Error> {
    const skeleton = `<?xml version="1.0" encoding="UTF-8"?>
<doma:domain xmlns:doma="${DOMA_NS}" xmlns:adtcore="${ADTCORE_NS}" adtcore:description="" adtcore:language="EN" adtcore:name="${escapeXml(def.name.toUpperCase())}" adtcore:type="DOMA/DD" adtcore:masterLanguage="EN" adtcore:responsible="${escapeXml(meta.responsible.toUpperCase())}">
  <adtcore:packageRef adtcore:name="${escapeXml(meta.packageName)}"/>
  <doma:content>
    <doma:typeInformation>
      <doma:datatype/>
      <doma:length>000000</doma:length>
      <doma:decimals>000000</doma:decimals>
    </doma:typeInformation>
    <doma:outputInformation>
      <doma:length>000000</doma:length>
      <doma:style>00</doma:style>
      <doma:conversionExit/>
      <doma:signExists>false</doma:signExists>
      <doma:lowercase>false</doma:lowercase>
      <doma:ampmFormat>false</doma:ampmFormat>
    </doma:outputInformation>
    <doma:valueInformation>
      <doma:valueTableRef/>
      <doma:appendExists>false</doma:appendExists>
      <doma:fixValues/>
    </doma:valueInformation>
  </doma:content>
</doma:domain>`;
    return mergeDomainXml(skeleton, def);
}

/**
 * Read a domain definition from an ADT document
 *
 * @param xml - GET response body
 * @returns Definition or error
 */
export function parseDomainXml(xml: string): Result<DomainDef, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);
    const root = doc.documentElement;
    if (!root) return err(new Error('Empty domain document'));

    const [typeInfo, typeInfoErr] = requireChild(doc, DOMA_NS, 'typeInformation');
    if (typeInfoErr) return err(typeInfoErr);
    const [outputInfo, outputInfoErr] = requireChild(doc, DOMA_NS, 'outputInformation');
    if (outputInfoErr) return err(outputInfoErr);

    // typeInformation and outputInformation both have a <length>; read each from its parent.
    const [dataType, typeErr] = abapTypeFromAdt(
        elementText(typeInfo, 'datatype'),
        elementNumber(typeInfo, 'length'),
        elementNumber(typeInfo, 'decimals'),
    );
    if (typeErr) return err(typeErr);

    const valueTableRef = doc.getElementsByTagNameNS(DOMA_NS, 'valueTableRef')[0];
    const fixedValues: FixedValue[] = Array.from(doc.getElementsByTagNameNS(DOMA_NS, 'fixValue')).map(element => ({
        low: elementText(element, 'low'),
        high: elementText(element, 'high'),
        text: elementText(element, 'text'),
    }));

    return ok({
        name: root.getAttributeNS(ADTCORE_NS, 'name') ?? '',
        description: root.getAttributeNS(ADTCORE_NS, 'description') ?? '',
        dataType,
        outputLength: elementNumber(outputInfo, 'length'),
        caseSensitive: childText(doc, DOMA_NS, 'lowercase') === 'true',
        signed: childText(doc, DOMA_NS, 'signExists') === 'true',
        conversionRoutine: childText(doc, DOMA_NS, 'conversionExit'),
        valueTable: valueTableRef?.getAttributeNS(ADTCORE_NS, 'name') ?? '',
        fixedValues,
    });
}

/**
 * Apply a definition onto an existing ADT document
 *
 * Only DSL-owned fields change; style, ampm format and append flags are kept.
 * A null output length keeps the document's current value. Fixed values are
 * replaced as a whole and renumbered from the DSL order.
 *
 * @param xml - Current document (GET body or skeleton)
 * @param def - Definition to apply
 * @returns Updated XML body for PUT/POST
 */
export function mergeDomainXml(xml: string, def: DomainDef): Result<string, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);
    const root = doc.documentElement;
    if (!root) return err(new Error('Empty domain document'));

    root.setAttributeNS(ADTCORE_NS, 'adtcore:description', def.description);

    // Type and output information.
    const [typeInfo, typeInfoErr] = requireChild(doc, DOMA_NS, 'typeInformation');
    if (typeInfoErr) return err(typeInfoErr);
    const [outputInfo, outputInfoErr] = requireChild(doc, DOMA_NS, 'outputInformation');
    if (outputInfoErr) return err(outputInfoErr);

    const typeFields: [Element, string, string][] = [
        [typeInfo, 'datatype', def.dataType.kind.toUpperCase()],
        [typeInfo, 'length', padNumber(def.dataType.length, NUMBER_WIDTH)],
        [typeInfo, 'decimals', padNumber(def.dataType.decimals, NUMBER_WIDTH)],
    ];
    if (def.outputLength !== null) typeFields.push([outputInfo, 'length', padNumber(def.outputLength, NUMBER_WIDTH)]);
    for (const [parent, localName, value] of typeFields) {
        const element = parent.getElementsByTagNameNS(DOMA_NS, localName)[0];
        if (!element) return err(new Error(`Missing <${localName}> in domain document`));
        setText(element, value);
    }

    const flags: [string, string][] = [
        ['conversionExit', def.conversionRoutine.toUpperCase()],
        ['signExists', String(def.signed)],
        ['lowercase', String(def.caseSensitive)],
    ];
    for (const [localName, value] of flags) {
        const [, setErr] = setChildText(doc, DOMA_NS, localName, value);
        if (setErr) return err(setErr);
    }

    // Value table reference.
    const [valueTableRef, refErr] = requireChild(doc, DOMA_NS, 'valueTableRef');
    if (refErr) return err(refErr);
    for (const attribute of VALUE_TABLE_ATTRIBUTES) valueTableRef.removeAttributeNS(ADTCORE_NS, attribute);
    if (def.valueTable) {
        valueTableRef.setAttributeNS(ADTCORE_NS, 'adtcore:uri', `/sap/bc/adt/ddic/tables/${def.valueTable.toLowerCase()}`);
        valueTableRef.setAttributeNS(ADTCORE_NS, 'adtcore:type', VALUE_TABLE_TYPE);
        valueTableRef.setAttributeNS(ADTCORE_NS, 'adtcore:name', def.valueTable.toUpperCase());
    }

    // Fixed values, replaced as a whole.
    const [fixValues, fixErr] = requireChild(doc, DOMA_NS, 'fixValues');
    if (fixErr) return err(fixErr);
    while (fixValues.firstChild) fixValues.removeChild(fixValues.firstChild);
    def.fixedValues.forEach((value, index) => {
        const entry = doc.createElementNS(DOMA_NS, 'doma:fixValue');
        const parts: [string, string][] = [
            ['position', padNumber(index + 1, POSITION_WIDTH)],
            ['low', value.low],
            ['high', value.high],
            ['text', value.text],
        ];
        for (const [localName, text] of parts) {
            const child = doc.createElementNS(DOMA_NS, `doma:${localName}`);
            setText(child, text);
            entry.appendChild(child);
        }
        fixValues.appendChild(entry);
    });

    return ok(serializeXml(doc));
}

function elementText(parent: Element, localName: string): string {
    return parent.getElementsByTagNameNS(DOMA_NS, localName)[0]?.textContent ?? '';
}

function elementNumber(parent: Element, localName: string): number {
    const value = Number.parseInt(elementText(parent, localName), 10);
    return Number.isNaN(value) ? 0 : value;
}
