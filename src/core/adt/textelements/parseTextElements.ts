// Parse the ADT text format of one text pool part into entries

import type { Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { TextElementEntry, TextElementsPart } from './types';
import { stripBom } from '../../utils/bom';

const MAX_LENGTH_ANNOTATION = /^@MaxLength\s*:\s*(\d+)$/i;
const DDIC_REFERENCE_ANNOTATION = /^@DDICReference$/i;

// SAP's text for a selection parameter that has none
export const UNTEXTED_PLACEHOLDER = '?...';

export const HEADING_KEYS = ['listHeader', 'columnHeader_1', 'columnHeader_2', 'columnHeader_3', 'columnHeader_4'] as const;

/**
 * Parse one part's text, as ADT serves it (also LF-only, blank lines optional):
 * - symbols: `@MaxLength:N` then `KEY=text`
 * - selections: optional `@DDICReference` then `NAME    =text`
 * - headings: `listHeader=text`, `columnHeader_1=text` .. `columnHeader_4=text`
 *
 * Entries SAP serves for "no text" are dropped: untexted selections (`=?...`) and empty headings.
 */
export function parseTextElements(part: TextElementsPart, text: string): Result<TextElementEntry[], Error> {
    const entries: TextElementEntry[] = [];
    let maxLength: number | undefined;
    let ddicReference = false;

    const lines = stripBom(text).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!.trimEnd();
        if (line.trim() === '') continue;

        const lengthMatch = MAX_LENGTH_ANNOTATION.exec(line.trim());
        if (lengthMatch) {
            if (part !== 'symbols') return err(new Error(`Line ${i + 1}: @MaxLength only applies to text symbols`));
            maxLength = Number(lengthMatch[1]);
            continue;
        }
        if (DDIC_REFERENCE_ANNOTATION.test(line.trim())) {
            if (part !== 'selections') return err(new Error(`Line ${i + 1}: @DDICReference only applies to selection texts`));
            ddicReference = true;
            continue;
        }
        if (line.trim().startsWith('@')) return err(new Error(`Line ${i + 1}: unknown annotation '${line.trim()}'`));

        const separator = line.indexOf('=');
        if (separator <= 0) return err(new Error(`Line ${i + 1}: expected KEY=text, got '${line}'`));

        const [key, keyError] = normalizeKey(part, line.slice(0, separator).trim(), i + 1);
        if (keyError) return err(keyError);

        const entry: TextElementEntry = { key, text: line.slice(separator + 1) };
        if (maxLength !== undefined) entry.maxLength = maxLength;
        if (ddicReference) entry.ddicReference = true;
        maxLength = undefined;
        ddicReference = false;

        if (part === 'selections' && !entry.ddicReference && entry.text === UNTEXTED_PLACEHOLDER) continue;
        if (part === 'headings' && entry.text === '') continue;
        entries.push(entry);
    }

    return ok(entries);
}

function normalizeKey(part: TextElementsPart, key: string, lineNumber: number): Result<string, Error> {
    if (!key) return err(new Error(`Line ${lineNumber}: missing key before '='`));
    if (part !== 'headings') return ok(key.toUpperCase());

    const heading = HEADING_KEYS.find(name => name.toLowerCase() === key.toLowerCase());
    if (!heading) return err(new Error(`Line ${lineNumber}: unknown heading '${key}' (expected ${HEADING_KEYS.join(', ')})`));
    return ok(heading);
}
