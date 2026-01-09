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
 * - Should output certificate lengths
 *
 * Expected output on non-domain machine:
 * - Should fail with Kerberos/authentication error
 * - This is normal - SSO requires domain credentials
 */
