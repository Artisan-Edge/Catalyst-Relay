// Text elements — URI and media type of a text pool and its parts

import type { TextElementsOwner, TextElementsPart } from './types';
import { TEXT_ELEMENTS_KINDS, TEXT_ELEMENTS_ROOT } from './types';

/**
 * Media type of one part, e.g. application/vnd.sap.adt.textelements.symbols.v1
 */
export function textElementsMediaType(part: TextElementsPart): string {
    return `application/vnd.sap.adt.textelements.${part}.v1`;
}

/**
 * Text pool URI, e.g. /sap/bc/adt/textelements/programs/zfoo
 */
export function textElementsUri(owner: TextElementsOwner): string {
    const config = TEXT_ELEMENTS_KINDS[owner.kind];
    return `${TEXT_ELEMENTS_ROOT}/${config.endpoint}/${encodeURIComponent(owner.name.toLowerCase())}`;
}
