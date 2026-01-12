import { z } from 'zod';

/**
 * Authentication types supported by SAP ADT
 */
export type AuthType = 'basic' | 'saml' | 'sso';

/**
 * Basic authentication configuration
 */
export interface BasicAuthConfig {
    type: 'basic';
    username: string;
    password: string;
}

/**
 * CSS selectors for SAML login form
 */
export interface SamlFormSelectors {
    /** CSS selector for username input field */
    username: string;
    /** CSS selector for password input field */
    password: string;
    /** CSS selector for submit button */
    submit: string;
}

/**
 * SAML provider configuration
 */
export interface SamlProviderConfig {
    /** Whether to ignore HTTPS certificate errors */
    ignoreHttpsErrors: boolean;
    /** CSS selectors for login form elements */
    formSelectors: SamlFormSelectors;
}

/**
 * SAML authentication configuration
 */
export interface SamlAuthConfig {
    type: 'saml';
    /** SAML username (often an email address) - used for browser login */
    username: string;
    /** SAML password */
    password: string;
    /** SAP system username - used for object creation (adtcore:responsible) */
    sapUser: string;
    /** Optional custom provider configuration for non-standard login forms */
    providerConfig?: SamlProviderConfig;
}

/**
 * SSO (Kerberos) authentication configuration
 */
export interface SsoAuthConfig {
    type: 'sso';
    /** Secure Login Server URL (e.g., https://sapsso.corp.example.com) */
    slsUrl: string;
    /** SLS profile name (default: SAPSSO_P) */
    profile?: string;
    /** Kerberos service principal name override */
    servicePrincipalName?: string;
    /** Force certificate re-enrollment even if valid cert exists */
    forceEnroll?: boolean;
    /** @deprecated Use slsUrl instead */
    certificate?: string;
}

/**
 * Union of all auth configurations
 */
export type AuthConfig = BasicAuthConfig | SamlAuthConfig | SsoAuthConfig;

/**
 * Auto-refresh configuration for session keepalive
 */
export interface AutoRefreshConfig {
    /** Enable automatic session refresh (default: true) */
    enabled: boolean;
    /** Refresh interval in milliseconds (default: 7200000 = 2 hours) */
    intervalMs?: number;
}

/**
 * Client configuration for connecting to SAP ADT
 */
export interface ClientConfig {
    /** ADT server URL (e.g., https://server:port) */
    url: string;
    /** SAP client number (e.g., '100') */
    client: string;
    /** Authentication configuration */
    auth: AuthConfig;
    /** Request timeout in milliseconds (default: 30000) */
    timeout?: number;
    /** Skip SSL verification (dev only) */
    insecure?: boolean;
    /** Auto-refresh configuration for session keepalive (default: enabled with 2-hour interval) */
    autoRefresh?: AutoRefreshConfig;
}

/**
 * Zod schema for SAML form selectors
 */
const samlFormSelectorsSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
    submit: z.string().min(1),
});

/**
 * Zod schema for SAML provider configuration
 */
const samlProviderConfigSchema = z.object({
    ignoreHttpsErrors: z.boolean(),
    formSelectors: samlFormSelectorsSchema,
});

/**
 * Zod schema for runtime validation of ClientConfig
 */
export const clientConfigSchema = z.object({
    url: z.string().url(),
    client: z.string().min(1).max(3),
    auth: z.discriminatedUnion('type', [
        z.object({
            type: z.literal('basic'),
            username: z.string().min(1),
            password: z.string().min(1),
        }),
        z.object({
            type: z.literal('saml'),
            username: z.string().min(1),
            password: z.string().min(1),
            sapUser: z.string().min(1),
            providerConfig: samlProviderConfigSchema.optional(),
        }),
        z.object({
            type: z.literal('sso'),
            slsUrl: z.string().url(),
            profile: z.string().optional(),
            servicePrincipalName: z.string().optional(),
            forceEnroll: z.boolean().optional(),
            certificate: z.string().optional(),
        }),
    ]),
    timeout: z.number().positive().optional(),
    insecure: z.boolean().optional(),
    autoRefresh: z.object({
        enabled: z.boolean(),
        intervalMs: z.number().positive().optional(),
    }).optional(),
});
