/**
 * Unit Tests for exportSessionState — SSO certificate paths are exported only when the certificates are on disk
 */

import { describe, it, expect } from 'bun:test';
import { exportSessionState } from '../../client/methods/session';
import type { ClientContext, ClientState, SsoCerts } from '../../client/types';
import type { AuthType } from '../../core/auth/types';

const PATHS = { fullChainPath: '/certs/TESTER_full_chain.pem', keyPath: '/certs/TESTER_key.pem' };

// A logged-in context (exportSessionState only reads the state)
function context(authType: AuthType): ClientContext {
    const state = {
        session: { sessionId: 'S', username: 'TESTER', expiresAt: Number.MAX_SAFE_INTEGER },
        csrfToken: 'TOKEN',
        cookies: new Map([['SAP_SESSIONID', 'abc']]),
        authStrategy: { type: authType, getAuthHeaders: () => ({}) },
    } as unknown as ClientState;
    return { state } as unknown as ClientContext;
}

describe('exportSessionState', () => {
    it('exports the certificate paths when the certificates were written there', () => {
        const certs: SsoCerts = { cert: 'CERT', key: 'KEY', paths: PATHS };

        const state = exportSessionState(context('sso'), certs);

        expect(state?.ssoCertPaths).toEqual(PATHS);
    });

    it('exports no certificate paths when the certificates only live in memory', () => {
        const certs: SsoCerts = { cert: 'CERT', key: 'KEY' };

        const state = exportSessionState(context('sso'), certs);

        expect(state).not.toBeNull();
        expect(state).not.toHaveProperty('ssoCertPaths');
    });

    it('exports no certificate paths for basic auth', () => {
        const state = exportSessionState(context('basic'), undefined);

        expect(state?.cookies).toEqual([{ name: 'SAP_SESSIONID', value: 'abc' }]);
        expect(state).not.toHaveProperty('ssoCertPaths');
    });
});
