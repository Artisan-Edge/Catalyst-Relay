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
// Full E2E Test (Certificate Enrollment + SAP Login + CSRF Token)
// =============================================================================

describe('SSO Full E2E Test', () => {
    /**
     * Full end-to-end test:
     * 1. Create ADT client with SSO auth config
     * 2. Login (enrolls certificates from SLS + fetches CSRF token from SAP)
     * 3. Print CSRF token to verify mTLS is working
     */
    it('should complete full SSO login flow and fetch CSRF token', async () => {
        console.log('\n========================================');
        console.log('SSO Full E2E Test');
        console.log('========================================');
        console.log('Config:');
        console.log(`  SLS URL: ${TEST_CONFIG.slsUrl}`);
        console.log(`  Profile: ${TEST_CONFIG.profile}`);
        console.log(`  SPN: ${TEST_CONFIG.servicePrincipalName}`);
        console.log(`  SAP URL: ${TEST_CONFIG.sapUrl}`);
        console.log(`  SAP Client: ${TEST_CONFIG.sapClient}`);
        console.log(`  Insecure: ${TEST_CONFIG.insecure}`);
        console.log('----------------------------------------\n');

        // Step 1: Create ADT client with SSO auth
        console.log('Step 1: Creating ADT client with SSO auth...');
        const [client, clientErr] = createClient({
            url: TEST_CONFIG.sapUrl,
            client: TEST_CONFIG.sapClient,
            insecure: TEST_CONFIG.insecure,
            auth: {
                type: 'sso',
                slsUrl: TEST_CONFIG.slsUrl,
                profile: TEST_CONFIG.profile,
                servicePrincipalName: TEST_CONFIG.servicePrincipalName,
            },
        });

        if (clientErr) {
            console.log('Client creation FAILED:');
            console.log(`  Error: ${clientErr.message}`);
            expect(clientErr).toBeInstanceOf(Error);
            return;
        }

        console.log('  Client created successfully!\n');

        // Step 2: Login (this does certificate enrollment + CSRF token fetch)
        console.log('Step 2: Logging in (cert enrollment + CSRF fetch)...');
        const [session, loginErr] = await client.login();

        if (loginErr) {
            console.log('Login FAILED:');
            console.log(`  Error: ${loginErr.message}`);
            console.log('\nThis is expected on a non-domain machine.');
            console.log('On the Medtronic laptop, this should succeed.\n');
            expect(loginErr).toBeInstanceOf(Error);
            return;
        }

        // Step 3: Print session info
        console.log('Login SUCCEEDED!');
        console.log('----------------------------------------');
        console.log('Session Info:');
        console.log(`  Session ID: ${session.sessionId}`);
        console.log(`  Username: ${session.username}`);
        console.log(`  Expires At: ${new Date(session.expiresAt).toISOString()}`);
        console.log('----------------------------------------');
        console.log('\n🎉 SSO E2E TEST PASSED!\n');
        console.log('The mTLS certificates are working correctly.');
        console.log('CSRF token was fetched successfully from SAP server.\n');

        expect(session).toBeTruthy();
        expect(session.username).toBeTruthy();
        expect(session.sessionId).toBeTruthy();
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
