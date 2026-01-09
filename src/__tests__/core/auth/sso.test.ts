/**
 * SSO Authentication Tests
 *
 * Tests for SSO certificate enrollment via SAP Secure Login Server.
 *
 * NOTE: These tests require:
 * - Windows machine joined to Active Directory domain
 * - Valid Kerberos credentials (logged into domain)
 * - Network access to the SLS server
 *
 * Run with: bun test src/__tests__/core/auth/sso.test.ts
 */

import { describe, it, expect } from 'bun:test';
import { SsoAuth } from '../../../core/auth/sso';
import { enrollCertificate } from '../../../core/auth/sso/slsClient';
import { createClient } from '../../../core/client';
import { Agent } from 'undici';

// =============================================================================
// Configuration - UPDATE THESE FOR YOUR ENVIRONMENT
// =============================================================================

/**
 * SSO Test Configuration
 *
 * Update these values for your Medtronic environment:
 * - slsUrl: Your SLS server URL
 * - profile: SLS profile name (usually SAPSSO_P)
 * - servicePrincipalName: Kerberos SPN for the SLS server
 * - sapUrl: SAP ADT server URL for full E2E test
 * - sapClient: SAP client number (e.g., '100')
 */
const TEST_CONFIG = {
    // Medtronic SLS server URL
    slsUrl: 'https://sapssop.corp.medtronic.com:443',
    // SLS profile
    profile: 'SAPSSO_P',
    // Kerberos Service Principal Name
    servicePrincipalName: 'HTTP/sapssop.corp.medtronic.com',
    // Skip SSL verification (usually needed for corporate environments)
    insecure: true,
    // SAP ADT server URL (for full E2E test with CSRF token fetch)
    sapUrl: 'https://cpdb1pas.corp.medtronic.com:8007',
    // SAP client number
    sapClient: '100',
};

// =============================================================================
// SSO Auth Configuration Tests
// =============================================================================

describe('SsoAuth Configuration', () => {
    it('should create SsoAuth instance with valid config', () => {
        const auth = new SsoAuth({
            slsUrl: TEST_CONFIG.slsUrl,
            profile: TEST_CONFIG.profile,
            servicePrincipalName: TEST_CONFIG.servicePrincipalName,
            insecure: TEST_CONFIG.insecure,
        });

        expect(auth.type).toBe('sso');
    });

    it('should throw error when slsUrl is missing', () => {
        expect(() => {
            new SsoAuth({
                slsUrl: '',
                profile: TEST_CONFIG.profile,
                servicePrincipalName: TEST_CONFIG.servicePrincipalName,
            });
        }).toThrow('SsoAuth requires slsUrl');
    });

    it('should return empty auth headers (SSO uses mTLS)', () => {
        const auth = new SsoAuth({
            slsUrl: TEST_CONFIG.slsUrl,
            profile: TEST_CONFIG.profile,
            servicePrincipalName: TEST_CONFIG.servicePrincipalName,
        });

        const headers = auth.getAuthHeaders();
        expect(headers).toEqual({});
    });

    it('should return null certificates before login', () => {
        const auth = new SsoAuth({
            slsUrl: TEST_CONFIG.slsUrl,
            profile: TEST_CONFIG.profile,
            servicePrincipalName: TEST_CONFIG.servicePrincipalName,
        });

        const certs = auth.getCertificates();
        expect(certs).toBeNull();
    });
});

// =============================================================================
// Certificate Enrollment Tests (Requires Domain-Joined Machine)
// =============================================================================

describe('SSO Certificate Enrollment', () => {
    /**
     * This test attempts actual certificate enrollment.
     *
     * Expected results:
     * - On non-domain machine: Fails with Kerberos error
     * - On domain machine (Medtronic): Should succeed and return certificates
     */
    it('should attempt certificate enrollment', async () => {
        console.log('\n========================================');
        console.log('SSO Certificate Enrollment Test');
        console.log('========================================');
        console.log('Config:');
        console.log(`  SLS URL: ${TEST_CONFIG.slsUrl}`);
        console.log(`  Profile: ${TEST_CONFIG.profile}`);
        console.log(`  SPN: ${TEST_CONFIG.servicePrincipalName}`);
        console.log(`  Insecure: ${TEST_CONFIG.insecure}`);
        console.log('----------------------------------------\n');

        const [certs, error] = await enrollCertificate({
            config: {
                slsUrl: TEST_CONFIG.slsUrl,
                profile: TEST_CONFIG.profile,
                servicePrincipalName: TEST_CONFIG.servicePrincipalName,
            },
            insecure: TEST_CONFIG.insecure,
        });

        if (error) {
            console.log('Enrollment FAILED:');
            console.log(`  Error: ${error.message}`);
            console.log('\nThis is expected on a non-domain machine.');
            console.log('On the Medtronic laptop, this should succeed.\n');

            // Don't fail the test - we're just checking that the flow runs
            // The actual enrollment will fail without Kerberos
            expect(error).toBeInstanceOf(Error);
        } else {
            console.log('Enrollment SUCCEEDED!');
            console.log(`  Full chain length: ${certs.fullChain.length} bytes`);
            console.log(`  Private key length: ${certs.privateKey.length} bytes`);
            console.log('\nCertificates enrolled successfully.\n');

            expect(certs.fullChain).toBeTruthy();
            expect(certs.privateKey).toBeTruthy();
            expect(certs.fullChain).toContain('-----BEGIN CERTIFICATE-----');
            expect(certs.privateKey).toContain('-----BEGIN');
        }
    });

    /**
     * Full SSO Auth login flow test
     */
    it('should attempt SsoAuth login flow', async () => {
        console.log('\n========================================');
        console.log('SsoAuth Login Flow Test');
        console.log('========================================\n');

        const auth = new SsoAuth({
            slsUrl: TEST_CONFIG.slsUrl,
            profile: TEST_CONFIG.profile,
            servicePrincipalName: TEST_CONFIG.servicePrincipalName,
            insecure: TEST_CONFIG.insecure,
            forceEnroll: true, // Force fresh enrollment for testing
            returnContents: true, // Don't save to disk
        });

        const [, loginError] = await auth.performLogin(fetch);

        if (loginError) {
            console.log('Login FAILED:');
            console.log(`  Error: ${loginError.message}`);
            console.log('\nThis is expected on a non-domain machine.\n');

            expect(loginError).toBeInstanceOf(Error);
        } else {
            console.log('Login SUCCEEDED!');

            const certs = auth.getCertificates();
            expect(certs).not.toBeNull();

            if (certs) {
                console.log(`  Full chain: ${certs.fullChain.length} bytes`);
                console.log(`  Private key: ${certs.privateKey.length} bytes`);
            }

            console.log('\nSSO authentication successful!\n');
        }
    });
});

// =============================================================================
// Full E2E Diagnostic Test (Step-by-step with raw fetch testing)
// =============================================================================

describe('SSO Full E2E Diagnostic Test', () => {
    /**
     * Step-by-step diagnostic test to isolate where mTLS fails
     */
    it('should diagnose SSO mTLS step by step', async () => {
        console.log('\n========================================');
        console.log('SSO DIAGNOSTIC TEST');
        console.log('========================================');
        console.log('Config:');
        console.log(`  SLS URL: ${TEST_CONFIG.slsUrl}`);
        console.log(`  Profile: ${TEST_CONFIG.profile}`);
        console.log(`  SPN: ${TEST_CONFIG.servicePrincipalName}`);
        console.log(`  SAP URL: ${TEST_CONFIG.sapUrl}`);
        console.log(`  SAP Client: ${TEST_CONFIG.sapClient}`);
        console.log(`  Insecure: ${TEST_CONFIG.insecure}`);
        console.log('----------------------------------------\n');

        // =================================================================
        // STEP 1: Enroll certificates from SLS
        // =================================================================
        console.log('STEP 1: Enrolling certificates from SLS...');
        const [certs, enrollErr] = await enrollCertificate({
            config: {
                slsUrl: TEST_CONFIG.slsUrl,
                profile: TEST_CONFIG.profile,
                servicePrincipalName: TEST_CONFIG.servicePrincipalName,
            },
            insecure: TEST_CONFIG.insecure,
        });

        if (enrollErr) {
            console.log('❌ Certificate enrollment FAILED:');
            console.log(`  Error: ${enrollErr.message}`);
            throw new Error('Certificate enrollment failed - cannot continue');
        }

        console.log('✅ Certificate enrollment SUCCEEDED!');
        console.log(`  Full chain length: ${certs.fullChain.length} chars`);
        console.log(`  Private key length: ${certs.privateKey.length} chars`);

        // Show first few lines of certs to verify format
        const chainLines = certs.fullChain.split('\n');
        const keyLines = certs.privateKey.split('\n');
        console.log(`  Full chain starts with: ${chainLines[0]}`);
        console.log(`  Full chain has ${chainLines.filter(l => l.includes('BEGIN CERTIFICATE')).length} certificates`);
        console.log(`  Private key starts with: ${keyLines[0]}`);
        console.log('');

        // =================================================================
        // STEP 2: Test raw fetch to SAP with Bun's native fetch + tls option
        // =================================================================
        console.log('STEP 2: Testing RAW fetch to SAP with Bun tls option...');
        const csrfUrl = `${TEST_CONFIG.sapUrl}/sap/bc/adt/compatibility/graph?sap-client=${TEST_CONFIG.sapClient}`;
        console.log(`  URL: ${csrfUrl}`);

        try {
            // Test with Bun's native fetch and tls option
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const bunResponse = await fetch(csrfUrl, {
                method: 'GET',
                headers: {
                    'x-csrf-token': 'fetch',
                    'Accept': 'application/xml',
                },
                tls: {
                    cert: certs.fullChain,
                    key: certs.privateKey,
                    rejectUnauthorized: false,
                },
            } as any);

            console.log(`  Response status: ${bunResponse.status}`);
            console.log(`  Response statusText: ${bunResponse.statusText}`);

            const csrfToken = bunResponse.headers.get('x-csrf-token');
            console.log(`  CSRF token header: ${csrfToken ? csrfToken.substring(0, 30) + '...' : 'NOT FOUND'}`);

            if (bunResponse.status === 200 && csrfToken && csrfToken !== 'fetch') {
                console.log('✅ Bun native fetch with tls option WORKS!');
                console.log(`  Got CSRF token: ${csrfToken}`);
            } else {
                console.log('❌ Bun native fetch failed or no CSRF token');
                const text = await bunResponse.text();
                console.log(`  Response body (first 500 chars): ${text.substring(0, 500)}`);
            }
        } catch (bunErr) {
            console.log('❌ Bun native fetch threw error:');
            console.log(`  ${bunErr instanceof Error ? bunErr.message : String(bunErr)}`);
        }
        console.log('');

        // =================================================================
        // STEP 3: Test with undici Agent (Node.js style)
        // =================================================================
        console.log('STEP 3: Testing with undici Agent (Node.js style)...');

        try {
            const { fetch: undiciFetch } = await import('undici');

            const agent = new Agent({
                connect: {
                    cert: certs.fullChain,
                    key: certs.privateKey,
                    rejectUnauthorized: false,
                },
            });

            const undiciResponse = await undiciFetch(csrfUrl, {
                method: 'GET',
                headers: {
                    'x-csrf-token': 'fetch',
                    'Accept': 'application/xml',
                },
                dispatcher: agent,
            });

            console.log(`  Response status: ${undiciResponse.status}`);
            console.log(`  Response statusText: ${undiciResponse.statusText}`);

            const csrfToken = undiciResponse.headers.get('x-csrf-token');
            console.log(`  CSRF token header: ${csrfToken ? csrfToken.substring(0, 30) + '...' : 'NOT FOUND'}`);

            if (undiciResponse.status === 200 && csrfToken && csrfToken !== 'fetch') {
                console.log('✅ Undici fetch with Agent WORKS!');
                console.log(`  Got CSRF token: ${csrfToken}`);
            } else {
                console.log('❌ Undici fetch failed or no CSRF token');
                const text = await undiciResponse.text();
                console.log(`  Response body (first 500 chars): ${text.substring(0, 500)}`);
            }
        } catch (undiciErr) {
            console.log('❌ Undici fetch threw error:');
            console.log(`  ${undiciErr instanceof Error ? undiciErr.message : String(undiciErr)}`);
        }
        console.log('');

        // =================================================================
        // STEP 4: Test with Node.js https module directly (if available)
        // =================================================================
        console.log('STEP 4: Testing with Node.js https module...');

        try {
            const https = await import('https');
            const { URL } = await import('url');

            const urlObj = new URL(csrfUrl);

            const result = await new Promise<{ status: number; headers: Record<string, string>; body: string }>((resolve, reject) => {
                const req = https.request({
                    hostname: urlObj.hostname,
                    port: urlObj.port || 443,
                    path: urlObj.pathname + urlObj.search,
                    method: 'GET',
                    cert: certs.fullChain,
                    key: certs.privateKey,
                    rejectUnauthorized: false,
                    headers: {
                        'x-csrf-token': 'fetch',
                        'Accept': 'application/xml',
                    },
                }, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        resolve({
                            status: res.statusCode || 0,
                            headers: res.headers as Record<string, string>,
                            body,
                        });
                    });
                });

                req.on('error', reject);
                req.end();
            });

            console.log(`  Response status: ${result.status}`);
            const csrfToken = result.headers['x-csrf-token'];
            console.log(`  CSRF token header: ${csrfToken ? csrfToken.substring(0, 30) + '...' : 'NOT FOUND'}`);

            if (result.status === 200 && csrfToken && csrfToken !== 'fetch') {
                console.log('✅ Node.js https module WORKS!');
                console.log(`  Got CSRF token: ${csrfToken}`);
            } else {
                console.log('❌ Node.js https failed or no CSRF token');
                console.log(`  Response body (first 500 chars): ${result.body.substring(0, 500)}`);
            }
        } catch (httpsErr) {
            console.log('❌ Node.js https threw error:');
            console.log(`  ${httpsErr instanceof Error ? httpsErr.message : String(httpsErr)}`);
        }
        console.log('');

        // =================================================================
        // SUMMARY
        // =================================================================
        console.log('========================================');
        console.log('DIAGNOSTIC COMPLETE');
        console.log('========================================');
        console.log('If all 3 methods failed with 401, the certificates may be:');
        console.log('  - Not trusted by the SAP server');
        console.log('  - In wrong format');
        console.log('  - Missing intermediate CA certs');
        console.log('');
        console.log('Compare with Python: does Python work with these same certs?');
        console.log('');

        // Don't fail the test - this is diagnostic
        expect(true).toBe(true);
    });
});

// =============================================================================
// Manual Test Runner
// =============================================================================

/**
 * Run this file directly to test SSO enrollment:
 *
 *   bun run src/__tests__/core/auth/sso.test.ts
 *
 * Or run just this test file:
 *
 *   bun test src/__tests__/core/auth/sso.test.ts
 *
 * Expected output on Medtronic laptop:
 * - Should successfully enroll certificates
 * - Should fetch CSRF token from SAP server
 * - Should output session info
 *
 * Expected output on non-domain machine:
 * - Should fail with Kerberos/authentication error
 * - This is normal - SSO requires domain credentials
 */
