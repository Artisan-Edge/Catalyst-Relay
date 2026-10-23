/**
 * Format helpers shared by the DSL serializers
 */

const INDENT = '\t';

// Quote a DSL string literal ('' escapes a single quote).
export function quote(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

export function indentLines(lines: string[]): string[] {
    return lines.map(line => `${INDENT}${line}`);
}

export function labelAnnotation(description: string): string[] {
    return description ? [`@EndUserText.label: ${quote(description)}`] : [];
}
