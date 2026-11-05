/**
 * Function group names and URIs — which group an include, module or URI belongs to
 *
 * Types come from OBJECT_CONFIG_MAP (asfugr / asfinc / asfunc); no literals elsewhere.
 */

import { OBJECT_CONFIG_MAP } from '../types';

export const FUNCTION_GROUP = OBJECT_CONFIG_MAP.asfugr;
export const FUNCTION_GROUP_INCLUDE = OBJECT_CONFIG_MAP.asfinc;
export const FUNCTION_MODULE = OBJECT_CONFIG_MAP.asfunc;

// …/functions/groups/{group}/fmodules/… or …/includes/…
const PART_URI = /\/functions\/groups\/([^/?#]+)\/(?:fmodules|includes)\//i;
// …/functions/groups/{group} and anything below it (source, includes, modules, screens)
const GROUP_URI = /\/functions\/groups\/([^/?#]+)(?:[/?#]|$)/i;
// L<group><3 chars>, optionally in a namespace
const INCLUDE_NAME = /^(\/[A-Z0-9_]+\/)?L([A-Z0-9_]+)[A-Z0-9_]{3}$/i;
// SAPL<group>, the main program
const MAIN_PROGRAM_NAME = /^(\/[A-Z0-9_]+\/)?SAPL([A-Z0-9_]+)$/i;
// L<group>UXX lists the group's function modules; SAP regenerates it
const GENERATED_INCLUDE_SUFFIX = /UXX$/i;

/**
 * Group of a function module or include URI, e.g. …/functions/groups/zfyp7/fmodules/… → ZFYP7
 * (null for the group itself or its /source/main)
 */
export function containerFromUri(uri: string): string | null {
    const match = PART_URI.exec(uri);
    return match?.[1] ? decodeURIComponent(match[1]).toUpperCase() : null;
}

/**
 * Group of any URI under /functions/groups/{group}, the group's own URI included
 */
export function groupFromUri(uri: string): string | null {
    const match = GROUP_URI.exec(uri);
    return match?.[1] ? decodeURIComponent(match[1]).toUpperCase() : null;
}

/**
 * Group of an include named the SAP way, L<group><3 chars>: LZFOOF01 → ZFOO, /NS/LFOOTOP → /NS/FOO
 */
export function containerFromIncludeName(name: string): string | null {
    const match = INCLUDE_NAME.exec(name);
    if (!match?.[2]) return null;
    return `${match[1] ?? ''}${match[2]}`.toUpperCase();
}

/**
 * Group of a main program name: SAPLZFOO → ZFOO
 */
export function groupFromMainProgramName(name: string): string | null {
    const match = MAIN_PROGRAM_NAME.exec(name);
    if (!match?.[2]) return null;
    return `${match[1] ?? ''}${match[2]}`.toUpperCase();
}

/**
 * True for an include SAP generates and regenerates (L<group>UXX), which cannot be written
 */
export function isGeneratedInclude(name: string): boolean {
    return containerFromIncludeName(name) !== null && GENERATED_INCLUDE_SUFFIX.test(name);
}

export function isFunctionGroup(object: { extension: string }): boolean {
    return object.extension === FUNCTION_GROUP.extension;
}

export function isFunctionGroupInclude(object: { extension: string }): boolean {
    return object.extension === FUNCTION_GROUP_INCLUDE.extension;
}
