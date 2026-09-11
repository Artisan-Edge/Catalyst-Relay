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
    SamlCredentials,
    SamlBrowserLoginOptions,
} from './types';

export { DEFAULT_FORM_SELECTORS, DEFAULT_PROVIDER_CONFIG } from './types';

// Browser automation
export { performBrowserLogin } from './browser';
export { runLoginSequence, LOGIN_TIMEOUTS, MFA_HINT_MESSAGE, manualSignInMessage } from './loginSequence';
export type { PageDriver, LoginSequenceOptions } from './loginSequence';

// Cookie utilities
export { toAuthCookies, formatCookieHeader } from './cookies';
