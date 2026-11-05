/**
 * JSON parsing as a Result (BOM tolerated)
 */

import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';
import { stripBom } from './bom';

/**
 * Parse JSON text, ignoring a leading byte order mark
 */
export function safeJsonParse(text: string): Result<unknown, Error> {
    try {
        return ok(JSON.parse(stripBom(text)) as unknown);
    } catch (error) {
        return err(new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`));
    }
}
