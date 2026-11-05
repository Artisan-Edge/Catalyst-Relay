/**
 * Serialize Message Class — MessageClassDef → canonical .asmsag JSON
 *
 * One message per line so line diffs show one changed message as one changed line.
 */

import type { MessageClassDef } from './types';
import { sortMessages } from './parseMessageClass';

/**
 * @param def - Definition
 * @returns JSON text with a trailing newline
 */
export function serializeMessageClass(def: MessageClassDef): string {
    const messages = sortMessages(def.messages).map(message =>
        `{ "number": ${JSON.stringify(message.number)}, "text": ${JSON.stringify(message.text)}, "selfExplanatory": ${message.selfExplanatory} }`);

    const lines = ['{', `  "description": ${JSON.stringify(def.description)},`];
    if (messages.length === 0) {
        lines.push('  "messages": []');
    } else {
        lines.push('  "messages": [');
        messages.forEach((line, index) => lines.push(`    ${line}${index < messages.length - 1 ? ',' : ''}`));
        lines.push('  ]');
    }
    lines.push('}');
    return `${lines.join('\n')}\n`;
}
