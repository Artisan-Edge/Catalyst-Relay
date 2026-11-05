/**
 * Equivalent — semantic comparison of a local lock object against the server's
 */

import { serializeLockObject } from './serializeLockObject';
import type { LockObjectDef } from './types';

/**
 * True when the server lock object already matches the local definition (case-insensitive names)
 */
export function lockObjectsEquivalent(local: LockObjectDef, remote: LockObjectDef): boolean {
    return serializeLockObject(local) === serializeLockObject(remote);
}
