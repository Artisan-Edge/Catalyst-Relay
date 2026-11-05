/**
 * Object attributes — shared types and constants
 */

import { getAllExtensions, OBJECT_CONFIG_MAP } from '../types';

export const PROGRAM_NS = 'http://www.sap.com/adt/programs/programs';
export const PROGRAM_EXTENSION = OBJECT_CONFIG_MAP.asprog.extension;

/** Object types whose title and attributes can be read and written (ObjectConfig.hasAttributes) */
export const ATTRIBUTE_EXTENSIONS: readonly string[] = getAllExtensions().filter(extension => OBJECT_CONFIG_MAP[extension].hasAttributes);

/**
 * Attributes held in an object's metadata document
 */
export interface ObjectAttributes {
    /** Short text (TRDIRT, SEOCLASSTX, TLIBT) */
    title?: string;
    /** Program authorization group (TRDIR-SECU); '' clears it. Programs only */
    authorizationGroup?: string;
}

/**
 * Current attributes plus read-only facts from the same document
 */
export interface ObjectAttributesInfo extends ObjectAttributes {
    name: string;
    extension: string;
    /** Longest title SAP accepts */
    titleMaxLength?: number;
    /** Program type (e.g. executableProgram); read-only */
    programType?: string;
}

/**
 * Outcome of writing attributes
 */
export interface ObjectAttributesWriteResult {
    name: string;
    extension: string;
    /** Attributes that differed and were written (empty: nothing to do) */
    changed: (keyof ObjectAttributes)[];
    /** Non-fatal notes, e.g. an authorization group missing from TPGP */
    warnings: string[];
}

/**
 * A metadata document as served, with the URI and media type to PUT it back with
 */
export interface MetadataDocument {
    uri: string;
    xml: string;
    contentType: string;
}

/**
 * An edited metadata document and the attributes that changed
 */
export interface MetadataEdit {
    xml: string;
    changed: (keyof ObjectAttributes)[];
}
