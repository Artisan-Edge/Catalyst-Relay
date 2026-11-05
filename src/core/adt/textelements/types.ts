// Text elements (SE38 Goto > Text Elements) — shared types and constants

/**
 * Owner of a text pool: an ABAP program, a global class or a function group
 */
export type TextElementsOwnerKind = 'program' | 'class' | 'functionGroup';

/**
 * Text pool part: text symbols (TEXT-xxx), selection texts, list headings
 */
export type TextElementsPart = 'symbols' | 'selections' | 'headings';

export interface TextElementsOwner {
    kind: TextElementsOwnerKind;
    name: string;
}

/**
 * Text of each part, in the ADT text format (see parseTextElements)
 */
export type TextElementsParts = Partial<Record<TextElementsPart, string>>;

/**
 * One text pool entry.
 * - symbols: key is the 3-character symbol id, maxLength is required by SAP
 * - selections: key is the parameter / select-option name; ddicReference takes the text from the DDIC
 * - headings: key is listHeader or columnHeader_1..4
 */
export interface TextElementEntry {
    key: string;
    text: string;
    maxLength?: number;
    ddicReference?: boolean;
}

export interface TextElementsKindConfig {
    /** Collection segment under /sap/bc/adt/textelements */
    endpoint: string;
    /** ADT type of the text pool (activation reference) */
    type: string;
    label: string;
    parts: readonly TextElementsPart[];
}

export const TEXT_ELEMENTS_ROOT = '/sap/bc/adt/textelements';
export const TEXT_ELEMENTS_METADATA_TYPE = 'application/vnd.sap.adt.textelements.v1+xml';

/**
 * Pseudo-extension reported on activation results of text pools
 */
export const TEXT_ELEMENTS_EXTENSION = 'textelements';

export const ALL_TEXT_ELEMENT_PARTS: readonly TextElementsPart[] = ['symbols', 'selections', 'headings'];

// Classes only carry text symbols.
export const TEXT_ELEMENTS_KINDS: Record<TextElementsOwnerKind, TextElementsKindConfig> = {
    program: { endpoint: 'programs', type: 'PROG/PX', label: 'program', parts: ALL_TEXT_ELEMENT_PARTS },
    class: { endpoint: 'classes', type: 'CLAS/OCX', label: 'class', parts: ['symbols'] },
    functionGroup: { endpoint: 'functiongroups', type: 'FUGR/PX', label: 'function group', parts: ALL_TEXT_ELEMENT_PARTS },
};

export const TEXT_ELEMENTS_PART_LABELS: Record<TextElementsPart, string> = {
    symbols: 'text symbols',
    selections: 'selection texts',
    headings: 'list headings',
};
