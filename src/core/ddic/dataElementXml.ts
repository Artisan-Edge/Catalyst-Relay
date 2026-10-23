/**
 * Data Element XML — DataElementDef ↔ ADT document (application/vnd.sap.adt.dataelements.v2+xml)
 *
 * build, parse and merge are kept together: build is merge applied to a blank
 * skeleton, so create and update share one field mapping.
 */

import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';
import { escapeXml, safeParseXml } from '../utils/xml';
import type { DataElementDef, DataElementLabels, DdicObjectMeta } from './types';
import { abapTypeFromAdt } from './abapTypes';
import { ADTCORE_NS, childNumber, childText, padNumber, requireChild, serializeXml, setChildText } from './xmlDom';

const DTEL_NS = 'http://www.sap.com/adt/dictionary/dataelements';
const TYPE_KIND_DOMAIN = 'domain';
const TYPE_KIND_PREDEFINED = 'predefinedAbapType';
const NUMBER_WIDTH = 6;
// 0 makes SAP set the field length to the label maximum on activation.
const DERIVED_FIELD_LENGTH = '0';

const LABEL_FIELDS: Record<keyof DataElementLabels, string> = {
    short: 'shortField',
    medium: 'mediumField',
    long: 'longField',
    heading: 'headingField',
};

/**
 * Build the create document for a data element
 *
 * @param def - Data element definition
 * @param meta - Package and responsible user
 * @returns XML body for POST /sap/bc/adt/ddic/dataelements
 */
export function buildDataElementXml(def: DataElementDef, meta: DdicObjectMeta): Result<string, Error> {
    const skeleton = `<?xml version="1.0" encoding="UTF-8"?>
<blue:wbobj xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" xmlns:adtcore="${ADTCORE_NS}" adtcore:description="" adtcore:language="EN" adtcore:name="${escapeXml(def.name.toUpperCase())}" adtcore:type="DTEL/DE" adtcore:masterLanguage="EN" adtcore:responsible="${escapeXml(meta.responsible.toUpperCase())}">
  <adtcore:packageRef adtcore:name="${escapeXml(meta.packageName)}"/>
  <dtel:dataElement xmlns:dtel="${DTEL_NS}">
    <dtel:typeKind/>
    <dtel:typeName/>
    <dtel:dataType/>
    <dtel:dataTypeLength>000000</dtel:dataTypeLength>
    <dtel:dataTypeDecimals>000000</dtel:dataTypeDecimals>
    <dtel:shortFieldLabel/>
    <dtel:shortFieldLength>0</dtel:shortFieldLength>
    <dtel:shortFieldMaxLength>10</dtel:shortFieldMaxLength>
    <dtel:mediumFieldLabel/>
    <dtel:mediumFieldLength>0</dtel:mediumFieldLength>
    <dtel:mediumFieldMaxLength>20</dtel:mediumFieldMaxLength>
    <dtel:longFieldLabel/>
    <dtel:longFieldLength>0</dtel:longFieldLength>
    <dtel:longFieldMaxLength>40</dtel:longFieldMaxLength>
    <dtel:headingFieldLabel/>
    <dtel:headingFieldLength>0</dtel:headingFieldLength>
    <dtel:headingFieldMaxLength>55</dtel:headingFieldMaxLength>
    <dtel:searchHelp/>
    <dtel:searchHelpParameter/>
    <dtel:setGetParameter/>
    <dtel:defaultComponentName/>
    <dtel:deactivateInputHistory>false</dtel:deactivateInputHistory>
    <dtel:changeDocument>false</dtel:changeDocument>
    <dtel:leftToRightDirection>false</dtel:leftToRightDirection>
    <dtel:deactivateBIDIFiltering>false</dtel:deactivateBIDIFiltering>
  </dtel:dataElement>
</blue:wbobj>`;
    return mergeDataElementXml(skeleton, def);
}

/**
 * Read a data element definition from an ADT document
 *
 * @param xml - GET response body
 * @returns Definition or error for unsupported type kinds
 */
export function parseDataElementXml(xml: string): Result<DataElementDef, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);

    const root = doc.documentElement;
    if (!root) return err(new Error('Empty data element document'));
    const [, findErr] = requireChild(doc, DTEL_NS, 'dataElement');
    if (findErr) return err(findErr);

    const labels: DataElementLabels = {
        short: childText(doc, DTEL_NS, 'shortFieldLabel'),
        medium: childText(doc, DTEL_NS, 'mediumFieldLabel'),
        long: childText(doc, DTEL_NS, 'longFieldLabel'),
        heading: childText(doc, DTEL_NS, 'headingFieldLabel'),
    };
    const base = {
        name: root.getAttributeNS(ADTCORE_NS, 'name') ?? '',
        description: root.getAttributeNS(ADTCORE_NS, 'description') ?? '',
        labels,
    };

    // Typed by a domain.
    const typeKind = childText(doc, DTEL_NS, 'typeKind');
    if (typeKind === TYPE_KIND_DOMAIN) {
        return ok({ ...base, dataType: null, domain: childText(doc, DTEL_NS, 'typeName') });
    }

    // Typed by a predefined ABAP type.
    if (typeKind !== TYPE_KIND_PREDEFINED) return err(new Error(`Unsupported data element type kind '${typeKind}' on ${base.name}`));
    const [dataType, typeErr] = abapTypeFromAdt(
        childText(doc, DTEL_NS, 'dataType'),
        childNumber(doc, DTEL_NS, 'dataTypeLength'),
        childNumber(doc, DTEL_NS, 'dataTypeDecimals'),
    );
    if (typeErr) return err(typeErr);
    return ok({ ...base, dataType, domain: null });
}

/**
 * Apply a definition onto an existing ADT document
 *
 * Only DSL-owned fields change; everything else (search help, SET/GET
 * parameter, change document, ...) is kept as the server sent it.
 *
 * @param xml - Current document (GET body or skeleton)
 * @param def - Definition to apply
 * @returns Updated XML body for PUT/POST
 */
export function mergeDataElementXml(xml: string, def: DataElementDef): Result<string, Error> {
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return err(parseErr);
    const root = doc.documentElement;
    if (!root) return err(new Error('Empty data element document'));

    root.setAttributeNS(ADTCORE_NS, 'adtcore:description', def.description);

    // Type fields.
    const fields: [string, string][] = def.domain
        ? [
            ['typeKind', TYPE_KIND_DOMAIN],
            ['typeName', def.domain.toUpperCase()],
            ['dataType', ''],
            ['dataTypeLength', padNumber(0, NUMBER_WIDTH)],
            ['dataTypeDecimals', padNumber(0, NUMBER_WIDTH)],
        ]
        : [
            ['typeKind', TYPE_KIND_PREDEFINED],
            ['typeName', ''],
            ['dataType', def.dataType?.kind.toUpperCase() ?? ''],
            ['dataTypeLength', padNumber(def.dataType?.length ?? 0, NUMBER_WIDTH)],
            ['dataTypeDecimals', padNumber(def.dataType?.decimals ?? 0, NUMBER_WIDTH)],
        ];

    // Labels; a changed label resets its field length so SAP re-derives it.
    for (const [key, prefix] of Object.entries(LABEL_FIELDS) as [keyof DataElementLabels, string][]) {
        const current = childText(doc, DTEL_NS, `${prefix}Label`);
        fields.push([`${prefix}Label`, def.labels[key]]);
        if (current !== def.labels[key]) fields.push([`${prefix}Length`, DERIVED_FIELD_LENGTH]);
    }

    for (const [localName, value] of fields) {
        const [, setErr] = setChildText(doc, DTEL_NS, localName, value);
        if (setErr) return err(setErr);
    }

    return ok(serializeXml(doc));
}
