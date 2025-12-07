/**
 * SSO authentication module
 *
 * Kerberos-based SSO authentication for SAP systems using mTLS certificates
 * obtained from SAP Secure Login Server (SLS).
 *
 * Platform support:
 * - Windows: Uses SSPI for Kerberos (requires Active Directory)
 * - Linux/macOS: Uses MIT Kerberos (requires kinit)
 *
 * Dependencies:
 * - kerberos (optional peer dependency)
 * - node-forge (for certificate operations)
 */

// Main auth strategy
export { SsoAuth } from './sso';
export type { SsoAuthConfig } from './sso';

// Types
export type {
    SlsConfig,
    CertificateMaterial,
    CertificatePaths,
} from './types';

// Individual operations (for advanced usage)
export { enrollCertificate } from './slsClient';
export { getSpnegoToken, extractSpnFromUrl } from './kerberos';
export { generateKeypair, createCsr, getCurrentUsername } from './certificate';
export { parsePkcs7Certificates } from './pkcs7';
export {
    saveCertificates,
    loadCertificates,
    certificatesExist,
    isCertificateExpired,
    getCertificatePaths,
} from './storage';
