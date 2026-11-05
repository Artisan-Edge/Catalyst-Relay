/**
 * Form handler types — shared by core/forms and the per-type codecs (ddic, msag, enqu)
 */

import type { Result } from '../../types/result';
import type { DdicObjectMeta } from '../ddic/types';

/**
 * Object name, package and owner for building a create document
 */
export interface FormObjectMeta extends DdicObjectMeta {
    name: string;
}

/**
 * One PUT of a form object update; the label names what it applies (for partial-failure errors)
 */
export interface FormUpdateBody {
    label: string;
    body: string;
}

export interface FormHandler {
    /** Parse and validate source, then build the create document */
    buildXml(source: string, meta: FormObjectMeta): Result<string, Error>;
    /**
     * Parse and validate source, then build the PUT bodies (in order) that apply it onto the server document.
     * The lock handle is only used by message classes (SAP needs it on each updated message).
     */
    updateBodies(xml: string, source: string, lockHandle: string): Result<FormUpdateBody[], Error>;
    /** Server document → canonical source */
    toSource(xml: string): Result<string, Error>;
    /** Source → canonical source (for diffs) */
    canonical(source: string): Result<string, Error>;
    /** True when the server's canonical source already matches the local source */
    equivalent(localSource: string, remoteSource: string): Result<boolean, Error>;
    /** Name declared in the source, or null when the format takes it from the file name */
    declaredName(source: string): Result<string | null, Error>;
}
