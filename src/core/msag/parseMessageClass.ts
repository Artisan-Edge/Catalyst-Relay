/**
 * Parse Message Class — .asmsag JSON → MessageClassDef
 *
 * Structural parse only; SAP's write rules live in validateMessageClass. Numbers
 * may be given as integers or short digit strings and are padded to three digits.
 * Trailing blanks are dropped, as SAP does. A leading BOM is ignored.
 */

import { z } from 'zod';
import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';
import { safeJsonParse } from '../utils/json';
import type { MessageClassDef, MessageDef } from './types';
import { MESSAGE_NUMBER_WIDTH } from './types';

const DEFAULT_SELF_EXPLANATORY = true;

const messageSchema = z.strictObject({
    number: z.union([z.string(), z.number().int().nonnegative()]),
    text: z.string(),
    selfExplanatory: z.boolean().optional(),
});

const messageClassSchema = z.strictObject({
    description: z.string(),
    messages: z.array(messageSchema).optional(),
});

/**
 * Parse .asmsag text
 *
 * @param source - JSON text
 * @returns Definition (messages sorted by number) or error
 */
export function parseMessageClass(source: string): Result<MessageClassDef, Error> {
    const [json, jsonErr] = safeJsonParse(source);
    if (jsonErr) return err(jsonErr);

    const parsed = messageClassSchema.safeParse(json);
    if (!parsed.success) {
        const issues = parsed.error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
        return err(new Error(`Invalid message class: ${issues.join('; ')}`));
    }

    const messages: MessageDef[] = (parsed.data.messages ?? []).map(message => ({
        number: normalizeNumber(message.number),
        text: message.text.trimEnd(),
        selfExplanatory: message.selfExplanatory ?? DEFAULT_SELF_EXPLANATORY,
    }));
    return ok({ description: parsed.data.description.trimEnd(), messages: sortMessages(messages) });
}

/**
 * Canonical message number: trimmed, uppercase, digits zero-padded to three places
 */
export function normalizeNumber(value: string | number): string {
    const text = String(value).trim().toUpperCase();
    return /^\d+$/.test(text) ? text.padStart(MESSAGE_NUMBER_WIDTH, '0') : text;
}

export function sortMessages(messages: MessageDef[]): MessageDef[] {
    return [...messages].sort((a, b) => a.number.localeCompare(b.number));
}
