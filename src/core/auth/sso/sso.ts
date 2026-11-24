/**
 * SSO (Single Sign-On) authentication strategy
 *
 * Implements Kerberos-based SSO for SAP systems using mTLS certificates
 * obtained from SAP Secure Login Server (SLS).
 *
 * Authentication flow:
 * 1. Check for existing valid certificates
 * 2. If missing or expired, enroll new certificate via SLS
 * 3. Use mTLS for all subsequent ADT requests
 *
 * Platform support:
 * - Windows: Uses SSPI for Kerberos (requires Active Directory)
 * - Linux/macOS: Uses MIT Kerberos (requires kinit)
 *
 * @example
 * ```typescript
 * const auth = new SsoAuth({
 *     slsUrl: 'https://sapsso.corp.example.com',
 * });
 *
 * // Enroll certificate (or load from cache)
 * const [, error] = await auth.performLogin(fetch);
 * if (error) {
 *     console.error('SSO failed:', error.message);
 *     return;
 * }
 *
 * // Get certificates for mTLS
 * const certs = auth.getCertificates();
 * ```
 */

import type { AuthStrategy } from '../types';
import type { AsyncResult } from '../../../types/result';
import type { SpnegoTokenProvider } from '../../../types/config';
import { ok, err } from '../../../types/result';
import type { SlsConfig, CertificateMaterial, CertificatePaths } from './types';
import { enrollCertificate } from './slsClient';
import { loadCertificates, saveCertificates, certificatesExist, isCertificateExpired, getCertificatePaths } from './storage';

// SLS certificates live ~10h, so the 1-day default buffer would re-enroll on every login; an hour keeps a reused certificate good for a working session
const CERT_REUSE_BUFFER_DAYS = 1 / 24;

/**
 * Internal configuration for SSO authentication strategy.
 *
 * This differs from the public SsoAuthConfig (in types/config.ts) by:
 * - No `type` discriminator (strategy already knows it's SSO)
 * - Includes `insecure` and `returnContents` (injected by factory)
 */
export interface SsoStrategyConfig {
    /** Secure Login Server URL */
    slsUrl: string;
    /** SLS profile (default: SAPSSO_P) */
    profile?: string;
    /** Service principal name override */
    servicePrincipalName?: string;
    /** Skip SSL verification (required for most corporate environments) */
    insecure?: boolean;
    /** Force certificate re-enrollment even if valid cert exists */
    forceEnroll?: boolean;
    /** Return certificate contents instead of saving to files */
    returnContents?: boolean;
    /** Gets the SPNEGO token instead of the kerberos package */
    spnegoTokenProvider?: SpnegoTokenProvider;
}

/**
 * SSO authentication strategy using Kerberos and mTLS
 */
export class SsoAuth implements AuthStrategy {
    readonly type = 'sso' as const;
    private config: SsoStrategyConfig;
    private certificates: CertificateMaterial | null = null;
    // Where the current certificates are on disk; null when they only live in memory (returnContents)
    private certificatePaths: CertificatePaths | null = null;

    /**
     * Create an SSO Auth strategy
     *
     * @param config - SSO strategy configuration
     */
    constructor(config: SsoStrategyConfig) {
        if (!config.slsUrl) {
            throw new Error('SsoAuth requires slsUrl');
        }
        this.config = config;
    }

    /**
     * Get auth headers for SSO
     *
     * SSO uses mTLS for authentication, not headers.
     * Returns empty headers - the mTLS agent handles auth.
     */
    getAuthHeaders(): Record<string, string> {
        return {};
    }

    /**
     * Get mTLS certificates
     *
     * Returns the certificate material after successful login.
     * Used by ADT client to create an mTLS agent.
     *
     * @returns Certificate material or null if not enrolled
     */
    getCertificates(): CertificateMaterial | null {
        return this.certificates;
    }

    // Files the current certificates were saved to or loaded from; null when they were never written
    getStoredCertificatePaths(): CertificatePaths | null {
        return this.certificatePaths;
    }

    /**
     * Perform SSO login via certificate enrollment
     *
     * Checks for existing valid certificates and enrolls new ones if needed.
     *
     * @param _fetchFn - Unused, kept for interface compatibility
     * @returns Success/error tuple
     */
    async performLogin(_fetchFn: typeof fetch): AsyncResult<void, Error> {
        // Check for existing certificates
        if (!this.config.forceEnroll) {
            const [loadResult, loadErr] = await this.tryLoadExistingCertificates();
            if (!loadErr && loadResult) {
                this.certificates = loadResult;
                this.certificatePaths = getCertificatePaths();
                return ok(undefined);
            }
        }

        // Enroll new certificate
        const slsConfig: SlsConfig = {
            slsUrl: this.config.slsUrl,
        };
        if (this.config.profile) {
            slsConfig.profile = this.config.profile;
        }
        if (this.config.servicePrincipalName) {
            slsConfig.servicePrincipalName = this.config.servicePrincipalName;
        }

        const [material, enrollErr] = await enrollCertificate({
            config: slsConfig,
            insecure: this.config.insecure ?? false,
            ...(this.config.spnegoTokenProvider && { spnegoTokenProvider: this.config.spnegoTokenProvider }),
        });

        if (enrollErr) {
            return err(enrollErr);
        }

        // Save certificates to filesystem (unless returnContents is true)
        let paths: CertificatePaths | null = null;
        if (!this.config.returnContents) {
            const [savedPaths, saveErr] = await saveCertificates(material);
            if (saveErr) {
                return err(saveErr);
            }
            paths = savedPaths;
        }

        this.certificates = material;
        this.certificatePaths = paths;
        return ok(undefined);
    }

    /**
     * Try to load and validate existing certificates
     */
    private async tryLoadExistingCertificates(): AsyncResult<CertificateMaterial> {
        // Check if files exist
        const exists = await certificatesExist();
        if (!exists) {
            return err(new Error('No existing certificates found'));
        }

        // Load certificates
        const [material, loadErr] = await loadCertificates();
        if (loadErr) {
            return err(loadErr);
        }

        // Check expiry
        const [isExpired, expiryErr] = isCertificateExpired(material.fullChain, CERT_REUSE_BUFFER_DAYS);
        if (expiryErr) {
            return err(expiryErr);
        }

        if (isExpired) {
            return err(new Error('Certificate is expired or expiring soon'));
        }

        return ok(material);
    }
}
