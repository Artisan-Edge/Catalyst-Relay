/**
 * Content normalization utilities
 *
 * Used for comparing object content between server and local versions.
 * SAP servers may insert whitespace variations (carriage returns, extra spaces)
 * that shouldn't be considered meaningful differences.
 */

import { stripBom } from './bom';

/**
 * Normalize content for comparison
 *
 * Drops a leading BOM, replaces all consecutive whitespace (spaces, tabs, newlines,
 * carriage returns) with a single space. Trims leading/trailing whitespace.
 *
 * @param content - Raw content string
 * @returns Normalized content with single spaces
 */
export function normalizeContent(content: string): string {
    return stripBom(content).replace(/\s+/g, ' ').trim();
}
