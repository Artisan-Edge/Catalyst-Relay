/**
 * Certificate storage
 *
 * Persists and retrieves mTLS certificates from the filesystem.
 */

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { AsyncResult, Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { CertificateMaterial, CertificatePaths } from './types';
import { CERTIFICATE_STORAGE } from './types';
import { getCurrentUsername } from './certificate';

/**
 * Get certificate file paths for a user
 *
 * @param username - Username (defaults to current user)
 * @returns Certificate file paths
 */
export function getCertificatePaths(username?: string): CertificatePaths {
    const user = username ?? getCurrentUsername();
    return {
        fullChainPath: join(CERTIFICATE_STORAGE.BASE_DIR, `${user}${CERTIFICATE_STORAGE.FULL_CHAIN_SUFFIX}`),
        keyPath: join(CERTIFICATE_STORAGE.BASE_DIR, `${user}${CERTIFICATE_STORAGE.KEY_SUFFIX}`),
    };
}

/**
 * Save certificates to filesystem
 *
 * @param material - Certificate material to save
 * @param username - Username (defaults to current user)
 * @returns File paths or error
 *
 * @example
 * ```typescript
 * const [paths, error] = await saveCertificates(material);
 * if (error) {
 *     console.error('Save failed:', error.message);
 *     return;
 * }
 *
 * console.log('Saved to:', paths.fullChainPath, paths.keyPath);
 * ```
 */
export async function saveCertificates(
    material: CertificateMaterial,
    username?: string
): AsyncResult<CertificatePaths> {
    const paths = getCertificatePaths(username);

    try {
        // Ensure directory exists
        await mkdir(CERTIFICATE_STORAGE.BASE_DIR, { recursive: true });

        // Write certificate files
        await writeFile(paths.fullChainPath, material.fullChain, 'utf-8');
        await writeFile(paths.keyPath, material.privateKey, { encoding: 'utf-8', mode: 0o600 });

        return ok(paths);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return err(new Error(`Failed to save certificates: ${message}`));
    }
}

/**
 * Load certificates from filesystem
 *
 * @param username - Username (defaults to current user)
 * @returns Certificate material or error
 *
 * @example
 * ```typescript
 * const [material, error] = await loadCertificates();
 * if (error) {
 *     // Certificates don't exist, need to enroll
 *     return;
 * }
 *
 * // Use loaded certificates
 * ```
 */
export async function loadCertificates(username?: string): AsyncResult<CertificateMaterial> {
    const paths = getCertificatePaths(username);

    try {
        const [fullChain, privateKey] = await Promise.all([
            readFile(paths.fullChainPath, 'utf-8'),
            readFile(paths.keyPath, 'utf-8'),
        ]);

        return ok({ fullChain, privateKey });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return err(new Error(`Failed to load certificates: ${message}`));
    }
}

/**
 * Check if certificates exist for a user
 *
 * @param username - Username (defaults to current user)
 * @returns True if certificates exist
 */
export async function certificatesExist(username?: string): Promise<boolean> {
    const paths = getCertificatePaths(username);

    try {
        await Promise.all([
            stat(paths.fullChainPath),
            stat(paths.keyPath),
        ]);
        return true;
    } catch {
        return false;
    }
}

/**
 * Check if a certificate is expired or will expire soon
 *
 * @param certPem - PEM-encoded certificate
 * @param bufferDays - Days before expiry to consider as "expiring soon" (default: 1)
 * @returns True if expired or expiring soon
 */
export function isCertificateExpired(certPem: string, bufferDays: number = 1): Result<boolean> {
    try {
        // Import forge dynamically to avoid loading it if not needed
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const forge = require('node-forge');

        const cert = forge.pki.certificateFromPem(certPem);
        const notAfter = cert.validity.notAfter as Date;
        const bufferMs = bufferDays * 24 * 60 * 60 * 1000;
        const expiryThreshold = new Date(Date.now() + bufferMs);

        return ok(notAfter <= expiryThreshold);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return err(new Error(`Failed to check certificate expiry: ${message}`));
    }
}
