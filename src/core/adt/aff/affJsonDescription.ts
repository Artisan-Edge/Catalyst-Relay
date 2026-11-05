/**
 * AFF JSON Description — header.description of an abap-file-formats JSON source
 */

import { safeJsonParse } from '../../utils/json';

/**
 * header.description, or '' when absent or the text is not JSON (a leading BOM is ignored)
 */
export function affJsonDescription(content: string): string {
    const [parsed, parseErr] = safeJsonParse(content);
    if (parseErr || !isRecord(parsed)) return '';
    const header = parsed['header'];
    if (!isRecord(header)) return '';
    const description = header['description'];
    return typeof description === 'string' ? description : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
