/**
 * Validate Message Class — SAP's rules for writing a message class
 */

import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';
import type { MessageClassDef } from './types';
import { MAX_DESCRIPTION_LENGTH, MAX_TEXT_LENGTH } from './types';

// ADT only writes numeric message numbers (SAP's own classes may hold letters).
const WRITABLE_NUMBER = /^\d{3}$/;

/**
 * Check a definition can be written: texts present and within SAP's lengths, numbers
 * three digits, no duplicates. An empty description passes here (a class SAP already
 * holds without one reads back as ''); creating a class or clearing one is refused
 * by buildMessageClassXml / messageClassUpdateBodies.
 */
export function validateMessageClass(def: MessageClassDef): Result<void, Error> {
    if (def.description.length > MAX_DESCRIPTION_LENGTH) {
        return err(new Error(`description is ${def.description.length} characters; the maximum is ${MAX_DESCRIPTION_LENGTH}`));
    }

    const seen = new Set<string>();
    for (const message of def.messages) {
        if (!WRITABLE_NUMBER.test(message.number)) {
            return err(new Error(`Message number '${message.number}' must be three digits (000-999)`));
        }
        if (seen.has(message.number)) return err(new Error(`Message ${message.number} is listed more than once`));
        seen.add(message.number);

        if (!message.text.trim()) return err(new Error(`Message ${message.number} needs a text`));
        if (message.text.length > MAX_TEXT_LENGTH) {
            return err(new Error(`Message ${message.number} text is ${message.text.length} characters; the maximum is ${MAX_TEXT_LENGTH}`));
        }
    }
    return ok(undefined);
}
