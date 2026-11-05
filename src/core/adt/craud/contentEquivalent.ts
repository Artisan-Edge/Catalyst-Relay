/**
 * Content Equivalent — does local source already match the server's?
 */

import type { Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import { getConfigByExtension } from '../types';
import { getFormHandler } from '../../forms';
import { affJsonEquivalent } from '../aff';
import { normalizeContent } from '../../utils/content';

/**
 * Compare local source with the server's for an object type: form objects semantically,
 * AFF JSON as parsed values, other sources as whitespace-normalized text (BOM ignored)
 *
 * @param extension - Object extension
 * @param local - Local source
 * @param remote - Server source (as read by readObject)
 * @returns true when writing local would change nothing, or a parse error of a form source
 */
export function contentEquivalent(extension: string, local: string, remote: string): Result<boolean, Error> {
    const config = getConfigByExtension(extension);
    if (!config) return err(new Error(`Unsupported extension: ${extension}`));

    if (config.sourceFormat === 'aff-json') return ok(affJsonEquivalent(local, remote));
    const handler = config.kind === 'form' ? getFormHandler(extension) : null;
    if (handler) return handler.equivalent(local, remote);
    return ok(normalizeContent(local) === normalizeContent(remote));
}
