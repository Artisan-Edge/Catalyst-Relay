/**
 * Refuse Invalid AFF Source — check an object's AFF JSON source before any request touches SAP
 */

import type { Result } from '../../../types/result';
import { ok } from '../../../types/result';
import type { ObjectContent } from '../../../types/requests';
import { getConfigByExtension } from '../types';
import { requireAffJsonPaths } from './requireAffJsonPaths';

/**
 * For an aff-json type: error when the source is empty, not a JSON object, or lacks a required
 * path (AffJsonRules.requiredPaths). Other types pass. No HTTP; run before creating or locking.
 */
export function refuseInvalidAffSource(object: Pick<ObjectContent, 'name' | 'extension' | 'content'>): Result<void, Error> {
    const config = getConfigByExtension(object.extension);
    if (config?.sourceFormat !== 'aff-json') return ok(undefined);
    return requireAffJsonPaths(object.content, config.affJson ?? {}, `${config.label} ${object.name}`);
}
