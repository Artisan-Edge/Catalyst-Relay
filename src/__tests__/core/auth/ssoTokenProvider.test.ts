/**
 * SSO spnegoTokenProvider tests (hermetic: a local HTTPS server stands in for Secure Login Server)
 *
 * The no-provider path calls the real kerberos package, so it is covered by integration/sso-workflow.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import forge from 'node-forge';
import { createClient } from '../../../client';
import { getSpnegoToken } from '../../../core/auth/sso';
import type { SpnegoTokenProvider } from '../../../types/config';

const SPN = 'HTTP/sapwdp.corp.example.com';
const PROFILE = '1546b978-7951-4690-b0b8-ad04f38d7050';
const TOKEN = 'YIIGtgYGKwYBBQUCoIIGqjCCBqag';
const UNAUTHORIZED = 401;

const received: { method: string; path: string; authorization: string | null }[] = [];
let instance: ReturnType<typeof Bun.serve>;

// Self-signed certificate for the fake SLS; the client runs with insecure: true
function selfSignedCertificate(): { key: string; cert: string } {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date(Date.now() - 60_000);
    cert.validity.notAfter = new Date(Date.now() + 3_600_000);
    const subject = [{ name: 'commonName', value: '127.0.0.1' }];
    cert.setSubject(subject);
    cert.setIssuer(subject);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    return { key: forge.pki.privateKeyToPem(keys.privateKey), cert: forge.pki.certificateToPem(cert) };
}

beforeAll(() => {
    instance = Bun.serve({
        port: 0,
        hostname: '127.0.0.1',
        tls: selfSignedCertificate(),
        fetch(req) {
            const url = new URL(req.url);
            received.push({ method: req.method, path: url.pathname + url.search, authorization: req.headers.get('authorization') });
            return new Response('rejected by test', { status: UNAUTHORIZED });
        },
    });
});

afterAll(() => {
    instance.stop(true);
});

beforeEach(() => {
    received.length = 0;
});

// forceEnroll skips any certificates already saved on this machine
function ssoClient(spnegoTokenProvider: SpnegoTokenProvider) {
    const [client, error] = createClient({
        url: 'https://127.0.0.1:1',
        client: '100',
        insecure: true,
        auth: {
            type: 'sso',
            slsUrl: `https://127.0.0.1:${instance.port}`,
            profile: PROFILE,
            servicePrincipalName: SPN,
            forceEnroll: true,
            spnegoTokenProvider,
        },
    });
    if (error) throw error;
    return client;
}

describe('SSO spnegoTokenProvider', () => {
    it('sends the provider token to doLogin for the configured SPN and profile', async () => {
        const calls: string[] = [];
        const client = ssoClient(async (spn) => {
            calls.push(spn);
            return `${TOKEN}\n`;
        });

        const [, error] = await client.login();
        expect(error?.message).toContain(`SLS authentication failed: ${UNAUTHORIZED}`);
        expect(calls).toEqual([SPN]);
        expect(received).toEqual([{
            method: 'POST',
            path: `/SecureLoginServer/slc3/doLogin?profile=${PROFILE}`,
            authorization: `Negotiate ${TOKEN}`,
        }]);
    });

    it('fails without contacting SLS when the provider throws', async () => {
        const client = ssoClient(async () => {
            throw new Error('catalyst-auth exited with code 1');
        });

        const [, error] = await client.login();
        expect(error?.message).toBe('SPNEGO token provider failed: catalyst-auth exited with code 1');
        expect(received).toEqual([]);
    });

    it('rejects an empty token', async () => {
        const [token, error] = await getSpnegoToken(SPN, async () => '  \n');
        expect(token).toBeNull();
        expect(error?.message).toContain('the token provider returned an empty token');
    });
});
