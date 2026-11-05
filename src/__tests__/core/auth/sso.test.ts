/**
 * SSO Authentication Tests (hermetic: no Kerberos or network)
 *
 * Live certificate enrollment and login are in integration/sso-workflow.test.ts.
 */

import { describe, it, expect } from 'bun:test';
import { SsoAuth } from '../../../core/auth/sso';

const CONFIG = {
    slsUrl: 'https://sls.example.invalid:443',
    profile: 'SAPSSO_P',
    servicePrincipalName: 'HTTP/sls.example.invalid',
};

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
    });
});
