/**
 * SAML authentication types
 *
 * Defines provider configurations and form selectors for SAML browser automation.
 * Configs are loaded from config.json per-system, not hardcoded.
 */

/**
 * CSS selectors for login form elements
 *
 * Used by Playwright to locate and fill login form fields.
 */
export interface FormSelectors {
    /** CSS selector for username input field */
    username: string;
    /** CSS selector for password input field */
    password: string;
    /** CSS selector for submit button */
    submit: string;
}

/**
 * Default SAP IDP form selectors
 *
 * Used when no custom selectors are configured for a system.
 */
export const DEFAULT_FORM_SELECTORS: FormSelectors = {
    username: '#j_username',
    password: '#j_password',
    submit: '#logOnFormSubmit',
};

/**
 * Configuration for a SAML provider
 *
 * Defines how to interact with a specific SAP system's login page.
 * Configured per-system in config.json.
 */
export interface SamlProviderConfig {
    /** Whether to ignore HTTPS certificate errors */
    ignoreHttpsErrors: boolean;
    /** CSS selectors for login form elements */
    formSelectors: FormSelectors;
}

/**
 * Default SAML provider configuration
 *
 * Used when no SAML config is specified for a system.
 */
export const DEFAULT_PROVIDER_CONFIG: SamlProviderConfig = {
    ignoreHttpsErrors: false,
    formSelectors: DEFAULT_FORM_SELECTORS,
};

/**
 * Playwright cookie structure
 *
 * Matches Playwright's Cookie type for interoperability.
 */
export interface PlaywrightCookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
}

/**
 * Result of SAML browser login
 */
export interface SamlLoginResult {
    /** Session cookies from successful login */
    cookies: PlaywrightCookie[];
}
