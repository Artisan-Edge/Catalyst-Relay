/**
 * ADT Helpers — shared utilities for ADT operations
 *
 * Internal helpers used across multiple ADT files.
 * Not exported from the adt/ barrel.
 */

import type { AsyncResult } from '../../types/result';
import { extractError } from '../utils/xml';
import { getConfigByExtension } from './types';
import type { ObjectConfig } from './types';

/**
 * Check response for errors and return text content
 */
export async function checkResponse(
    response: Response | null,
    requestErr: Error | null,
    operation: string
): AsyncResult<string, Error> {
    if (requestErr) return [null, requestErr];
    if (!response) return [null, new Error(`${operation}: No response`)];
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return [null, new Error(`${operation}: ${errorMsg}`)];
    }
    return [await response.text(), null];
}

/**
 * Validate extension and return config
 */
export function requireConfig(extension: string): [ObjectConfig, null] | [null, Error] {
    const config = getConfigByExtension(extension);
    if (!config) return [null, new Error(`Unsupported extension: ${extension}`)];
    return [config, null];
}
