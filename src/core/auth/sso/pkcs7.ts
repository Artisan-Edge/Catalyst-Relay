/**
 * PKCS#7 certificate parsing
 *
 * Parses PKCS#7 SignedData structures returned by SAP Secure Login Server
 * to extract client certificates and CA chain.
 */

import forge from 'node-forge';
import type { Result } from '../../../types/result';
import { ok, err } from '../../../types/result';

/**
 * Parsed certificate chain
 */
export interface ParsedCertificates {
    /** PEM-encoded client certificate + CA chain */
    fullChain: string;
    /** PEM-encoded client certificate only */
    clientCert: string;
    /** PEM-encoded CA chain (intermediate + root) */
    caChain: string;
}

/**
 * Parse PKCS#7 certificate data from SLS response
 *
 * SLS returns a base64-encoded PKCS#7 structure containing:
 * - Client certificate (first cert)
 * - CA certificate chain (remaining certs)
 *
 * @param data - Raw response data from SLS (may be base64-encoded)
 * @returns Parsed certificates or error
 *
 * @example
 * ```typescript
 * const [certs, error] = parsePkcs7Certificates(responseBuffer);
 * if (error) {
 *     console.error('Parse failed:', error.message);
 *     return;
 * }
 *
 * console.log(certs.clientCert);  // PEM client cert
 * console.log(certs.caChain);     // PEM CA chain
 * console.log(certs.fullChain);   // Both combined
 * ```
 */
export function parsePkcs7Certificates(data: Buffer): Result<ParsedCertificates> {
    try {
        // Clean and decode the data
        // SLS returns base64-encoded PKCS#7 with possible whitespace
        const dataString = data.toString('utf-8').replace(/\r?\n/g, '').trim();
        const derBytes = forge.util.decode64(dataString);

        // Parse PKCS#7 structure
        const p7Asn1 = forge.asn1.fromDer(derBytes);
        const p7 = forge.pkcs7.messageFromAsn1(p7Asn1);

        // Extract certificates from SignedData
        if (!('certificates' in p7) || !p7.certificates || p7.certificates.length === 0) {
            return err(new Error('No certificates found in PKCS#7 structure'));
        }

        const certificates = p7.certificates as forge.pki.Certificate[];

        // First certificate is the client cert, rest are CA chain
        const clientCert = certificates[0];
        const caCerts = certificates.slice(1);

        if (!clientCert) {
            return err(new Error('No client certificate found in PKCS#7 structure'));
        }

        // Convert to PEM format
        const clientCertPem = forge.pki.certificateToPem(clientCert);
        const caChainPem = caCerts
            .map(cert => forge.pki.certificateToPem(cert))
            .join('');

        return ok({
            clientCert: clientCertPem,
            caChain: caChainPem,
            fullChain: clientCertPem + caChainPem,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return err(new Error(`Failed to parse PKCS#7 certificates: ${message}`));
    }
}
