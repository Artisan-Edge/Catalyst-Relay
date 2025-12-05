import type { AuthConfig } from '../../types/config';
import type { AuthStrategy } from './types';
import { BasicAuth } from './basic';
import { SsoAuth } from './sso';
import { SamlAuth } from './saml';

/**
 * Create an authentication strategy based on configuration
 *
 * Factory function that instantiates the appropriate auth strategy
 * based on the auth config type (basic, saml, or sso).
 *
 * @param config - Authentication configuration
 * @returns Configured authentication strategy
 * @throws Error if config type is invalid
 *
 * @example
 * const auth = createAuthStrategy({
 *     type: 'basic',
 *     username: 'DEVELOPER',
 *     password: 'secret'
 * });
 */
export function createAuthStrategy(config: AuthConfig): AuthStrategy {
    switch (config.type) {
        case 'basic':
            return new BasicAuth(config.username, config.password);

        case 'saml':
            return new SamlAuth(
                config.username,
                config.password,
                config.provider
            );

        case 'sso':
            return new SsoAuth(config.certificate);

        default:
            // TypeScript exhaustiveness check
            const _exhaustive: never = config;
            throw new Error(`Unknown auth type: ${(_exhaustive as AuthConfig).type}`);
    }
}
