/**
 * SSO Authentication Tests (hermetic: no Kerberos or network)
 *
 * Live certificate enrollment and login are in integration/sso-workflow.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import forge from 'node-forge';
import { SsoAuth, saveCertificates, getCertificatePaths } from '../../../core/auth/sso';

const CONFIG = {
    slsUrl: 'https://sls.example.invalid:443',
    profile: 'SAPSSO_P',
    servicePrincipalName: 'HTTP/sls.example.invalid',
};

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

describe('SsoAuth Configuration', () => {
    it('should create SsoAuth instance with valid config', () => {
        const auth = new SsoAuth({ ...CONFIG, insecure: true });
        expect(auth.type).toBe('sso');
    });

    it('should throw error when slsUrl is missing', () => {
        expect(() => new SsoAuth({ ...CONFIG, slsUrl: '' })).toThrow('SsoAuth requires slsUrl');
    });

    it('should return empty auth headers (SSO uses mTLS)', () => {
        expect(new SsoAuth(CONFIG).getAuthHeaders()).toEqual({});
    });

    it('should return null certificates before login', () => {
        expect(new SsoAuth(CONFIG).getCertificates()).toBeNull();
        expect(new SsoAuth(CONFIG).getStoredCertificatePaths()).toBeNull();
    });
});

describe('SsoAuth certificate reuse', () => {
    // Certificates are stored under HOME; point it at a temp folder so the real ones are untouched
    const savedHome = process.env['HOME'];
    let home = '';
    let keys: forge.pki.rsa.KeyPair;

    beforeAll(async () => {
        home = await mkdtemp(join(tmpdir(), 'relay-sso-'));
        process.env['HOME'] = home;
        keys = forge.pki.rsa.generateKeyPair(1024);
    });

    afterAll(async () => {
        if (savedHome === undefined) delete process.env['HOME'];
        else process.env['HOME'] = savedHome;
        await rm(home, { recursive: true, force: true });
    });

    // A saved certificate that expires after the given time
    async function saveCertificateExpiringIn(ms: number): Promise<string> {
        const cert = forge.pki.createCertificate();
        cert.publicKey = keys.publicKey;
        cert.serialNumber = '01';
        cert.validity.notBefore = new Date(Date.now() - MINUTE_MS);
        cert.validity.notAfter = new Date(Date.now() + ms);
        const subject = [{ name: 'commonName', value: 'TESTER' }];
        cert.setSubject(subject);
        cert.setIssuer(subject);
        cert.sign(keys.privateKey, forge.md.sha256.create());

        const fullChain = forge.pki.certificateToPem(cert);
        const [, saveErr] = await saveCertificates({ fullChain, privateKey: forge.pki.privateKeyToPem(keys.privateKey) });
        if (saveErr) throw saveErr;
        return fullChain;
    }

    // Enrollment fails at once, so a login that enrolls shows up as this error
    function ssoAuth(): SsoAuth {
        return new SsoAuth({ ...CONFIG, spnegoTokenProvider: async () => { throw new Error('enrollment attempted'); } });
    }

    it('reuses a saved certificate with hours left (SLS certificates live ~10h)', async () => {
        const fullChain = await saveCertificateExpiringIn(9 * HOUR_MS);
        const auth = ssoAuth();

        const [, error] = await auth.performLogin(fetch);

        expect(error).toBeNull();
        expect(auth.getCertificates()?.fullChain).toBe(fullChain);
        expect(auth.getStoredCertificatePaths()).toEqual(getCertificatePaths());
    });

    it('re-enrolls when the saved certificate expires within 5 minutes', async () => {
        await saveCertificateExpiringIn(2 * MINUTE_MS);
        const auth = ssoAuth();

        const [, error] = await auth.performLogin(fetch);

        expect(error?.message).toContain('enrollment attempted');
        expect(auth.getCertificates()).toBeNull();
        expect(auth.getStoredCertificatePaths()).toBeNull();
    });
});
