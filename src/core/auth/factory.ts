import type { AuthConfig } from '../../types/config';
import type { AuthStrategy } from './types';
import { BasicAuth } from './basic';
import { SsoAuth, type SsoAuthConfig } from './sso';
import { SamlAuth } from './saml';

/**
 * Options for creating an authentication strategy
 */
export interface CreateAuthOptions {
    /** Authentication configuration */
    config: AuthConfig;
    /** Base URL of the SAP system (required for SAML) */
    baseUrl?: string;
    /** Skip SSL verification (dev only) */
    insecure?: boolean;
}

/**
 * Create an authentication strategy based on configuration
 *
 * Factory function that instantiates the appropriate auth strategy
 * based on the auth config type (basic, saml, or sso).
 *
 * @param options - Authentication options including config and optional baseUrl
 * @returns Configured authentication strategy
 * @throws Error if config type is invalid or required fields are missing
 *
 * @example
 * ```typescript
 * // Basic auth
 * const auth = createAuthStrategy({
 *     config: { type: 'basic', username: 'DEVELOPER', password: 'secret' }
 * });
 *
 * // SAML auth (requires baseUrl)
 * const auth = createAuthStrategy({
 *     config: { type: 'saml', username: 'user@example.com', password: 'secret' },
 *     baseUrl: 'https://sap-system.example.com'
 * });
 *
 * // SSO auth (Kerberos + mTLS)
 * const auth = createAuthStrategy({
 *     config: {
 *         type: 'sso',
 *         slsUrl: 'https://sapsso.corp.example.com'
 *     },
 *     insecure: true
 * });
 * ```
 */
export function createAuthStrategy(options: CreateAuthOptions): AuthStrategy {
    const { config, baseUrl, insecure } = options;

    switch (config.type) {
        case 'basic':
            return new BasicAuth(config.username, config.password);

        case 'saml':
            if (!baseUrl) {
                throw new Error('SAML authentication requires baseUrl');
            }
            return new SamlAuth({
                username: config.username,
                password: config.password,
                baseUrl,
                ...(config.providerConfig && { providerConfig: config.providerConfig }),
            });

        case 'sso': {
            const ssoConfig: SsoAuthConfig = {
                slsUrl: config.slsUrl,
            };
            if (config.profile) {
                ssoConfig.profile = config.profile;
            }
            if (config.servicePrincipalName) {
                ssoConfig.servicePrincipalName = config.servicePrincipalName;
            }
            if (config.forceEnroll) {
                ssoConfig.forceEnroll = config.forceEnroll;
            }
            if (insecure) {
                ssoConfig.insecure = insecure;
            }
            return new SsoAuth(ssoConfig);
        }

        default: {
            const _exhaustive: never = config;
            throw new Error(`Unknown auth type: ${(_exhaustive as AuthConfig).type}`);
        }
    }
}
