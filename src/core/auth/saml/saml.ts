/**
 * SAML authentication strategy
 *
 * Implements SAML-based SSO for SAP systems using browser automation.
 * Requires Playwright for headless browser login.
 *
 * @example
 * ```typescript
 * // With default SAP IDP selectors
 * const auth = new SamlAuth({
 *     username: 'user@example.com',
 *     password: 'secret',
 *     baseUrl: 'https://sap-system.example.com',
 * });
 *
 * // With custom form selectors
 * const auth = new SamlAuth({
 *     username: 'user@example.com',
 *     password: 'secret',
 *     baseUrl: 'https://sap-system.example.com',
 *     providerConfig: {
 *         ignoreHttpsErrors: true,
 *         formSelectors: {
 *             username: '#custom-user-field',
 *             password: '#custom-pass-field',
 *             submit: '#custom-submit-btn',
 *         },
 *     },
 * });
 *
 * // Perform login
 * const [, error] = await auth.performLogin(fetch);
 * if (error) {
 *     console.error('Login failed:', error.message);
 * }
 * ```
 */

import type { AuthStrategy, AuthCookie } from '../types';
import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { SamlProviderConfig } from './types';
import { performBrowserLogin } from './browser';
import { toAuthCookies, formatCookieHeader } from './cookies';

/**
 * Configuration for SAML authentication
 */
export interface SamlAuthConfig {
    /** SAML username (often an email address) - used for browser login */
    username: string;
    /** SAML password */
    password: string;
    /** SAP system username - used for object creation (adtcore:responsible) */
    sapUser: string;
    /** SAP system base URL */
    baseUrl: string;
    /** Optional custom provider configuration */
    providerConfig?: SamlProviderConfig;
}

/**
 * SAML authentication strategy
 */
export class SamlAuth implements AuthStrategy {
    readonly type = 'saml' as const;
    private cookies: AuthCookie[] = [];
    private config: SamlAuthConfig;

    /**
     * Create a SAML Auth strategy
     *
     * @param config - SAML authentication configuration
     */
    constructor(config: SamlAuthConfig) {
        if (!config.username || !config.password) {
            throw new Error('SamlAuth requires both username and password');
        }
        if (!config.sapUser) {
            throw new Error('SamlAuth requires sapUser (SAP system username for object creation)');
        }
        if (!config.baseUrl) {
            throw new Error('SamlAuth requires baseUrl');
        }
        this.config = config;
    }

    /**
     * Get SAP system username
     *
     * Used for object creation (adtcore:responsible) instead of the SAML email.
     */
    getSapUser(): string {
        return this.config.sapUser;
    }

    /**
     * Get auth headers for SAML
     *
     * After successful login, includes Cookie header with session cookies.
     */
    getAuthHeaders(): Record<string, string> {
        if (this.cookies.length === 0) {
            return {};
        }
        return {
            Cookie: formatCookieHeader(this.cookies),
        };
    }

    /**
     * Get authentication cookies
     *
     * @returns Array of cookies obtained during SAML login
     */
    getCookies(): AuthCookie[] {
        return this.cookies;
    }

    /**
     * Perform SAML login using headless browser automation
     *
     * Launches a Chromium browser, navigates to the SAP login page,
     * fills in credentials, and extracts session cookies.
     *
     * @param _fetchFn - Unused, kept for interface compatibility
     * @returns Success/error tuple
     */
    async performLogin(_fetchFn: typeof fetch): AsyncResult<void, Error> {
        const [playwrightCookies, loginError] = await performBrowserLogin({
            baseUrl: this.config.baseUrl,
            credentials: {
                username: this.config.username,
                password: this.config.password,
            },
            ...(this.config.providerConfig && { providerConfig: this.config.providerConfig }),
        });

        if (loginError) {
            return err(loginError);
        }

        this.cookies = toAuthCookies(playwrightCookies);

        if (this.cookies.length === 0) {
            return err(new Error('SAML login succeeded but no cookies were returned'));
        }

        return ok(undefined);
    }
}
