/**
 * Serialize Domain — DomainDef → canonical .asdoma text
 */

import type { DomainDef, FixedValue } from './types';
import { formatAbapType } from './abapTypes';
import { indentLines, labelAnnotation, quote } from './format';

/**
 * Render a domain as canonical DSL
 *
 * Clause order matches Catalyst-Core's serializer.
 *
 * @param def - Domain definition
 * @returns .asdoma text with a trailing newline
 */
export function serializeDomain(def: DomainDef): string {
    const body: string[] = [`data type : ${formatAbapType(def.dataType)};`];

    if (def.outputLength !== null) body.push(`output length : ${def.outputLength};`);
    if (def.caseSensitive) body.push('case sensitive;');
    if (def.signed) body.push('sign;');
    if (def.conversionRoutine) body.push(`conversion routine : ${def.conversionRoutine.toUpperCase()};`);
    if (def.valueTable) body.push(`value table : ${def.valueTable.toLowerCase()};`);
    if (def.fixedValues.length > 0) {
        body.push('fixed values {', ...indentLines(def.fixedValues.map(formatFixedValue)), '}');
    }

    return [
        ...labelAnnotation(def.description),
        `define domain ${def.name.toLowerCase()} {`,
        ...indentLines(body),
        '}',
        '',
    ].join('\n');
}

function formatFixedValue(value: FixedValue): string {
    const key = value.high ? `${quote(value.low)} to ${quote(value.high)}` : quote(value.low);
    return `${key} : ${quote(value.text)};`;
}
