/**
 * Serialize Lock Object — LockObjectDef → canonical .asenqu text
 */

import { indentLines, labelAnnotation } from '../ddic/format';
import type { LockObjectDef, LockTableDef } from './types';

/**
 * Render a lock object as canonical DSL (names lowercase, parameter colons aligned)
 *
 * @param def - Lock object definition
 * @returns .asenqu text with a trailing newline
 */
export function serializeLockObject(def: LockObjectDef): string {
    const width = Math.max(0, ...def.parameters.map(p => p.name.length));
    const parameters = def.parameters.map(p => `${p.name.toLowerCase().padEnd(width)} : ${p.table.toLowerCase()}.${p.field.toLowerCase()}${p.wanted ? '' : ' not wanted'};`);

    const body = [
        tableClause('primary', def.primary),
        ...def.secondary.map(table => tableClause('secondary', table)),
        'lock parameters {',
        ...indentLines(parameters),
        '}',
    ];

    return [
        ...labelAnnotation(def.description),
        ...(def.allowRfc ? ['@AllowRFC: true'] : []),
        `define lock object ${def.name.toLowerCase()} {`,
        ...indentLines(body),
        '}',
        '',
    ].join('\n');
}

function tableClause(kind: 'primary' | 'secondary', table: LockTableDef): string {
    return `${kind} table : ${table.table.toLowerCase()} lock mode ${table.lockMode};`;
}
