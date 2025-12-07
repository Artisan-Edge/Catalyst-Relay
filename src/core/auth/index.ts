/**
 * Authentication module
 *
 * Provides authentication strategies for SAP ADT:
 * - Basic: Username/password with HTTP Basic Auth
 * - SAML: SSO via browser automation (requires Playwright)
 * - SSO: Kerberos/Windows authentication (placeholder)
 *
 * @example
 * ```typescript
 * import { createAuthStrategy } from './auth';
 *
 * // Basic auth
 * const auth = createAuthStrategy({
 *     config: { type: 'basic', username: 'DEVELOPER', password: 'secret' }
 * });
 *
 * // SAML auth
 * const samlAuth = createAuthStrategy({
 *     config: { type: 'saml', username: 'user@example.com', password: 'secret' },
 *     baseUrl: 'https://sap-system.example.com'
 * });
 *
 * const headers = auth.getAuthHeaders();
 * // { 'Authorization': 'Basic ...' }
 * ```
 */

// Shared types
export type { AuthType, AuthStrategy, AuthCookie, BasicAuthCredentials } from './types';

// Strategy classes
export { BasicAuth } from './basic';
export { SamlAuth } from './saml';
export type { SamlAuthConfig } from './saml';
export { SsoAuth } from './sso';

// Factory
export type { CreateAuthOptions } from './factory';
export { createAuthStrategy } from './factory';

// SAML utilities for custom implementations
export type {
    FormSelectors,
    SamlProviderConfig,
    PlaywrightCookie,
} from './saml';
export { DEFAULT_FORM_SELECTORS, DEFAULT_PROVIDER_CONFIG } from './saml';
