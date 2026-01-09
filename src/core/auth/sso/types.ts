/**
 * SSO authentication types
 *
 * Types for Kerberos-based SSO authentication with SAP Secure Login Server (SLS).
 */

/**
 * Secure Login Server (SLS) configuration
 */
export interface SlsConfig {
    /** SLS server URL (e.g., https://sapsso.corp.example.com:443) */
    slsUrl: string;
    /** SLS profile name (default: SAPSSO_P) */
    profile?: string;
    /** Service principal name for Kerberos (e.g., HTTP/sapsso.corp.example.com) */
    servicePrincipalName?: string;
}

/**
 * Default SLS configuration values
 */
export const SLS_DEFAULTS = {
    PROFILE: 'SAPSSO_P',
    LOGIN_ENDPOINT: '/SecureLoginServer/slc3/doLogin',
    CERTIFICATE_ENDPOINT: '/SecureLoginServer/slc2/getCertificate',
    KEY_SIZE: 2048,
} as const;

/**
 * SLS authentication response from doLogin endpoint
 */
export interface SlsAuthResponse {
    clientConfig: {
        keySize?: number;
    };
}

/**
 * mTLS certificate material for use with undici Agent
 */
export interface CertificateMaterial {
    /** PEM-encoded client certificate + CA chain */
    fullChain: string;
    /** PEM-encoded private key */
    privateKey: string;
}

/**
 * Certificate file paths on disk
 */
export interface CertificatePaths {
    /** Path to client certificate + CA chain PEM file */
    fullChainPath: string;
    /** Path to private key PEM file */
    keyPath: string;
}

/**
 * Result of certificate enrollment - either material or paths
 */
export type CertificateResult = CertificateMaterial | CertificatePaths;

/**
 * Options for SLS client operations
 */
export interface SlsClientOptions {
    /** SLS configuration */
    config: SlsConfig;
    /** Skip SSL verification (dev only) */
    insecure?: boolean;
}

/**
 * Get the base directory for certificate storage
 * Uses the user's home directory to ensure consistent location regardless of CWD.
 * Falls back to relative path if home dir not available.
 */
function getCertificateBaseDir(): string {
    // Use HOME on Unix, USERPROFILE on Windows, or fallback to relative path
    const homeDir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '.';
    return `${homeDir}/.catalyst/certificates/sso`;
}

/**
 * Certificate storage directory structure
 */
export const CERTIFICATE_STORAGE = {
    get BASE_DIR(): string { return getCertificateBaseDir(); },
    FULL_CHAIN_SUFFIX: '_full_chain.pem',
    KEY_SUFFIX: '_key.pem',
} as const;
