/**
 * Equivalent — semantic comparison of a local message class against the server's
 */

import type { MessageClassDef } from './types';

/**
 * True when the server message class already matches the local definition (order-insensitive)
 */
export function messageClassesEquivalent(local: MessageClassDef, remote: MessageClassDef): boolean {
    if (local.description !== remote.description) return false;
    if (local.messages.length !== remote.messages.length) return false;

    const byNumber = new Map(remote.messages.map(message => [message.number, message]));
    return local.messages.every(message => {
        const other = byNumber.get(message.number);
        if (!other) return false;
        return other.text === message.text && other.selfExplanatory === message.selfExplanatory;
    });
}
