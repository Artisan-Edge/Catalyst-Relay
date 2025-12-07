/**
 * SAML authentication module
 *
 * Provides browser-based SAML login for SAP systems.
 * Requires Playwright for headless browser automation.
 */

// Main class and config
export { SamlAuth } from './saml';
export type { SamlAuthConfig } from './saml';

// Types
export type {
    FormSelectors,
    SamlProviderConfig,
    PlaywrightCookie,
    SamlLoginResult,
} from './types';

export { DEFAULT_FORM_SELECTORS, DEFAULT_PROVIDER_CONFIG } from './types';

// Browser automation
export type { SamlCredentials, SamlBrowserLoginOptions } from './browser';
export { performBrowserLogin } from './browser';

// Cookie utilities
export { toAuthCookies, formatCookieHeader } from './cookies';
