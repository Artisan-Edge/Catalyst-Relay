/**
 * DDIC Types — models for data element (.asdtel) and domain (.asdoma) definitions
 *
 * Fields mirror Catalyst-Core's Go structs (cds/structure/viewlikes).
 */

/**
 * Predefined ABAP type, e.g. abap.char(4) → { kind: 'char', length: 4, decimals: 0 }
 */
export interface AbapType {
    /** DSL kind (lowercase, e.g. 'char'); the ADT code is the uppercase form */
    kind: string;
    length: number;
    decimals: number;
}

export interface DataElementLabels {
    short: string;
    medium: string;
    long: string;
    heading: string;
}

/**
 * Data element: typed by a predefined ABAP type or a domain, never both
 */
export interface DataElementDef {
    name: string;
    /** Resolved description: @EndUserText.label, falling back to the long label */
    description: string;
    dataType: AbapType | null;
    domain: string | null;
    labels: DataElementLabels;
}

/**
 * Fixed value or value range; high is '' for a single value
 */
export interface FixedValue {
    low: string;
    high: string;
    text: string;
}

export interface DomainDef {
    name: string;
    description: string;
    dataType: AbapType;
    /** null when the source omits it (SAP derives it on activation) */
    outputLength: number | null;
    caseSensitive: boolean;
    signed: boolean;
    conversionRoutine: string;
    valueTable: string;
    fixedValues: FixedValue[];
}

/**
 * Package and owner metadata for building a create document
 */
export interface DdicObjectMeta {
    packageName: string;
    responsible: string;
}

/**
 * Line/column-aware parse error for DSL sources
 */
export class DdicParseError extends Error {
    constructor(message: string, public line: number, public column: number) {
        super(`${message} (line ${line}, column ${column})`);
        this.name = 'DdicParseError';
    }
}
