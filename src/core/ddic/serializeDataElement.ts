/**
 * Serialize Data Element — DataElementDef → canonical .asdtel text
 */

import type { DataElementDef, DataElementLabels } from './types';
import { formatAbapType } from './abapTypes';
import { indentLines, labelAnnotation, quote } from './format';

// Label keys are padded to this width, matching the Core/Script serializers.
const LABEL_KEY_WIDTH = 7;
const LABEL_KEYS: (keyof DataElementLabels)[] = ['short', 'medium', 'long', 'heading'];

/**
 * Render a data element as canonical DSL
 *
 * @param def - Data element definition
 * @returns .asdtel text with a trailing newline
 */
export function serializeDataElement(def: DataElementDef): string {
    const body: string[] = [];

    // Type clause.
    if (def.domain) body.push(`domain : ${def.domain.toLowerCase()};`);
    else if (def.dataType) body.push(`data type : ${formatAbapType(def.dataType)};`);

    // Labels block (non-empty labels only).
    const labelLines = LABEL_KEYS
        .filter(key => def.labels[key] !== '')
        .map(key => `${key.padEnd(LABEL_KEY_WIDTH)} : ${quote(def.labels[key])};`);
    if (labelLines.length > 0) body.push('labels {', ...indentLines(labelLines), '}');

    return [
        ...labelAnnotation(def.description),
        `define data element ${def.name.toLowerCase()} {`,
        ...indentLines(body),
        '}',
        '',
    ].join('\n');
}
