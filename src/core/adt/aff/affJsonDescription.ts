/**
 * AFF JSON Description — the description an abap-file-formats JSON source carries
 */

import { safeJsonParse } from '../../utils/json';

/**
 * header.description, else generalInformation.title (launchpad pages and spaces), or '' when neither
 * is set or the text is not JSON (a leading BOM is ignored)
 */
export function affJsonDescription(content: string): string {
    const [parsed, parseErr] = safeJsonParse(content);
    if (parseErr || !isRecord(parsed)) return '';
    return stringAt(parsed, 'header', 'description') || stringAt(parsed, 'generalInformation', 'title');
}

function stringAt(root: Record<string, unknown>, section: string, key: string): string {
    const block = root[section];
    if (!isRecord(block)) return '';
    const value = block[key];
    return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
