/**
 * Byte order mark handling for source text read from files
 */

export const BOM = '﻿';

/**
 * Drop a leading UTF-8 byte order mark (editors on Windows often add one)
 */
export function stripBom(text: string): string {
    return text.startsWith(BOM) ? text.slice(BOM.length) : text;
}
