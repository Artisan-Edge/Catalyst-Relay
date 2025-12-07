/**
 * Certificate generation for SSO authentication
 *
 * Generates RSA keypairs and PKCS#10 Certificate Signing Requests (CSR)
 * for SAP Secure Login Server certificate enrollment.
 */

import forge from 'node-forge';
import { SLS_DEFAULTS } from './types';

/**
 * Generated keypair with private key in PEM format
 */
export interface GeneratedKeypair {
    /** Private key in PEM format (PKCS#8) */
    privateKeyPem: string;
    /** forge private key object for signing */
    privateKey: forge.pki.rsa.PrivateKey;
    /** forge public key object */
    publicKey: forge.pki.rsa.PublicKey;
}

/**
 * Generate an RSA keypair
 *
 * @param keySize - Key size in bits (default: 2048)
 * @returns Generated keypair with PEM-encoded private key
 *
 * @example
 * ```typescript
 * const keypair = generateKeypair(2048);
 * console.log(keypair.privateKeyPem);
 * ```
 */
export function generateKeypair(keySize: number = SLS_DEFAULTS.KEY_SIZE): GeneratedKeypair {
    const keypair = forge.pki.rsa.generateKeyPair({ bits: keySize, e: 0x10001 });

    const privateKeyPem = forge.pki.privateKeyToPem(keypair.privateKey);

    return {
        privateKeyPem,
        privateKey: keypair.privateKey,
        publicKey: keypair.publicKey,
    };
}

/**
 * Create a Certificate Signing Request (CSR)
 *
 * Generates a PKCS#10 CSR with:
 * - Subject: CN=<username>
 * - Key Usage: digitalSignature, keyEncipherment
 * - Extended Key Usage: clientAuth (OID 1.3.6.1.5.5.7.3.2)
 *
 * @param keypair - RSA keypair to use for the CSR
 * @param username - Username for the certificate subject (CN)
 * @returns DER-encoded CSR as Buffer
 *
 * @example
 * ```typescript
 * const keypair = generateKeypair(2048);
 * const csrDer = createCsr(keypair, 'JOHNDOE');
 * ```
 */
export function createCsr(keypair: GeneratedKeypair, username: string): Buffer {
    const csr = forge.pki.createCertificationRequest();

    // Set subject (Common Name = username)
    csr.publicKey = keypair.publicKey;
    csr.setSubject([{
        name: 'commonName',
        value: username,
    }]);

    // Add Key Usage extension
    csr.setAttributes([{
        name: 'extensionRequest',
        extensions: [
            {
                name: 'keyUsage',
                digitalSignature: true,
                keyEncipherment: true,
            },
            {
                name: 'extKeyUsage',
                clientAuth: true,
            },
        ],
    }]);

    // Sign the CSR with SHA-256
    csr.sign(keypair.privateKey, forge.md.sha256.create());

    // Convert to DER format
    const csrAsn1 = forge.pki.certificationRequestToAsn1(csr);
    const csrDer = forge.asn1.toDer(csrAsn1);

    return Buffer.from(csrDer.getBytes(), 'binary');
}

/**
 * Get current Windows username
 *
 * @returns Username from environment or 'unknown'
 */
export function getCurrentUsername(): string {
    return process.env['USERNAME'] ?? process.env['USER'] ?? 'unknown';
}
