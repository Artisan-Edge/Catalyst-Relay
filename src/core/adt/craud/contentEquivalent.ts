/**
 * Content Equivalent — does local source already match the server's?
 */

import type { Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import { getConfigByExtension, OBJECT_CONFIG_MAP } from '../types';
import { getFormHandler } from '../../forms';
import { affJsonEquivalent } from '../aff';
import { moduleSourcesEquivalent } from '../functionGroup/moduleSourcesEquivalent';
import { normalizeCdsContent, normalizeSourceLines } from '../../utils/content';

const FUNCTION_MODULE_EXTENSION = OBJECT_CONFIG_MAP.asfunc.extension;

/**
 * Compare local source with the server's for an object type:
 * - form objects semantically, AFF JSON as parsed values (keys SAP adds or drops on save ignored)
 * - DDIC DDL (tables, structures) ignoring whitespace next to separators, which SAP re-lays out on activation
 * - other sources (ABAP, and CDS views, access controls, behavior and service definitions, which SAP
 *   keeps as written) line by line, line ends and trailing blanks ignored; a function module's
 *   signature, which ADT lays out itself, ignoring whitespace
 *
 * @param extension - Object extension
 * @param local - Local source
 * @param remote - Server source (as read by readObject)
 * @returns true when writing local would change nothing, or a parse error of a form source
 */
export function contentEquivalent(extension: string, local: string, remote: string): Result<boolean, Error> {
    const config = getConfigByExtension(extension);
    if (!config) return err(new Error(`Unsupported extension: ${extension}`));

    if (config.sourceFormat === 'aff-json') return ok(affJsonEquivalent(local, remote, config.affJson));
    const handler = config.kind === 'form' ? getFormHandler(extension) : null;
    if (handler) return handler.equivalent(local, remote);
    if (config.cdsSource) return ok(cdsSourcesEquivalent(local, remote));
    if (extension === FUNCTION_MODULE_EXTENSION) return ok(moduleSourcesEquivalent(local, remote));
    return ok(normalizeSourceLines(local) === normalizeSourceLines(remote));
}

// Whether a backslash escapes a quote in a CDS literal is unclear, so a pair with one must be equal
// under both readings (backslash as escape and as plain character)
function cdsSourcesEquivalent(local: string, remote: string): boolean {
    if (normalizeCdsContent(local) !== normalizeCdsContent(remote)) return false;
    if (!local.includes('\\') && !remote.includes('\\')) return true;
    return normalizeCdsContent(local, true) === normalizeCdsContent(remote, true);
}
