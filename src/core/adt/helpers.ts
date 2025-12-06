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
    // Handle request errors.
    if (requestErr) return [null, requestErr];
    if (!response) return [null, new Error(`${operation}: No response`)];

    // Handle HTTP errors.
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return [null, new Error(`${operation}: ${errorMsg}`)];
    }

    // Return successful response text.
    return [await response.text(), null];
}

/**
 * Validate extension and return config
 */
export function requireConfig(extension: string): [ObjectConfig, null] | [null, Error] {
    // Lookup configuration for extension.
    const config = getConfigByExtension(extension);
    if (!config) return [null, new Error(`Unsupported extension: ${extension}`)];

    // Return valid configuration.
    return [config, null];
}
