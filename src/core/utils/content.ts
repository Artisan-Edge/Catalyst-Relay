/**
 * Content normalization utilities
 *
 * Used for comparing object content between server and local versions.
 * SAP servers may insert whitespace variations (carriage returns, extra spaces)
 * that shouldn't be considered meaningful differences.
 */

/**
 * Normalize content for comparison
 *
 * Replaces all consecutive whitespace (spaces, tabs, newlines, carriage returns)
 * with a single space. Trims leading/trailing whitespace.
 *
 * @param content - Raw content string
 * @returns Normalized content with single spaces
 */
export function normalizeContent(content: string): string {
    return content.replace(/\s+/g, ' ').trim();
}
