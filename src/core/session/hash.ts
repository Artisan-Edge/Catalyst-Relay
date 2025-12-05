/**
 * Configuration hashing utilities
 *
 * Generates deterministic hashes from client configurations to deduplicate
 * connections with identical settings (same server, client, auth).
 */

import { createHash } from 'crypto';
import type { ClientConfig } from '../../types';

/**
 * Generates a SHA-256 hash from a client configuration
 *
 * Hash includes:
 * - Auth type
 * - Client number
 * - Credentials (username/password for basic/SAML)
 *
 * Identical configurations will produce the same hash, allowing
 * session reuse across multiple session IDs.
 *
 * @param config - Client configuration to hash
 * @returns Hexadecimal hash string
 *
 * @example
 * ```typescript
 * const config: ClientConfig = {
 *   url: 'https://server:443',
 *   client: '100',
 *   auth: { type: 'basic', username: 'user', password: 'pass' }
 * };
 * const hash = hashConnectionConfig(config);
 * // => "a1b2c3d4e5f6..."
 * ```
 */
export function hashConnectionConfig(config: ClientConfig): string {
    const parts: string[] = [
        config.auth.type,
        config.client,
    ];

    // Add credentials for non-SSO connections
    if (config.auth.type === 'basic' || config.auth.type === 'saml') {
        parts.push(config.auth.username);
        parts.push(config.auth.password);
    }

    const configStr = parts.join(':');
    return createHash('sha256').update(configStr, 'utf-8').digest('hex');
}
