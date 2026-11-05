/**
 * Unit Tests for withLock: lock → work → unlock, unlocking on every path
 */

import { describe, it, expect } from 'bun:test';
import { withLock } from '../../../../core/adt/craud/withLock';
import type { AdtRequestor } from '../../../../core/adt';
import { ok, err } from '../../../../types/result';

const TARGET = { uri: '/sap/bc/adt/oo/classes/zcl', label: 'Class ZCL' };
const LOCKED = '<LOCK_HANDLE>H1</LOCK_HANDLE>';

function sap(unlockStatus = 200): { requestor: AdtRequestor; actions: string[] } {
    const actions: string[] = [];
    const requestor: AdtRequestor = {
        request: async (options) => {
            const action = String(options.params?.['_action'] ?? options.method);
            actions.push(action);
            if (action === 'LOCK') return [new Response(LOCKED, { status: 200 }), null];
            if (action === 'UNLOCK') return [new Response('<exc:exception xmlns:exc="x"><message>unlock failed</message></exc:exception>', { status: unlockStatus }), null];
            return [new Response('', { status: 200 }), null];
        },
    };
    return { requestor, actions };
}

describe('withLock', () => {
    it('passes the handle and unlocks after success', async () => {
        const { requestor, actions } = sap();
        const [value, error] = await withLock(requestor, TARGET, async handle => ok(`used ${handle}`));
        expect([value, error]).toEqual(['used H1', null]);
        expect(actions).toEqual(['LOCK', 'UNLOCK']);
    });

    it('unlocks when the work fails and returns its error', async () => {
        const { requestor, actions } = sap();
        const [, error] = await withLock(requestor, TARGET, async () => err(new Error('PUT failed')));
        expect(error?.message).toBe('PUT failed');
        expect(actions).toEqual(['LOCK', 'UNLOCK']);
    });

    it('reports a failed unlock', async () => {
        const { requestor } = sap(500);
        expect((await withLock(requestor, TARGET, async () => ok(1)))[1]?.message).toContain('Failed to unlock Class ZCL');
        expect((await withLock(requestor, TARGET, async () => err(new Error('PUT failed'))))[1]?.message).toBe('PUT failed (and Failed to unlock Class ZCL: unlock failed)');
    });
});
