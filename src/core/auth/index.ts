/**
 * Authentication module
 *
 * Provides authentication strategies for SAP ADT:
 * - Basic: Username/password with HTTP Basic Auth
 * - SAML: SSO via browser automation (placeholder for MVP)
 * - SSO: Kerberos/Windows authentication (placeholder for MVP)
 *
 * Usage:
 * ```typescript
 * import { createAuthStrategy } from './auth';
 *
 * const auth = createAuthStrategy({
 *     type: 'basic',
 *     username: 'DEVELOPER',
 *     password: 'secret'
 * });
 *
 * const headers = auth.getAuthHeaders();
 * // { 'Authorization': 'Basic ...' }
 * ```
 */

// Export types
export type { AuthType, AuthStrategy, AuthCookie, BasicAuthCredentials } from './types';

// Export strategy classes
export { BasicAuth } from './basic';
export { SamlAuth } from './saml';
export { SsoAuth } from './sso';

// Export factory function
export { createAuthStrategy } from './factory';
