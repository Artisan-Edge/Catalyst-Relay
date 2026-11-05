/**
 * Unit Tests for creating includes in an existing function group (regression)
 *
 * A stateful include create after the session activated the group failed with "SAPL<group> not
 * found" and left SAPL<group> enqueued for the session. Includes are now created stateless (in a
 * context of their own) and never lock the main program; the includes of one group are written one
 * at a time (that create enqueues the group, so a sibling's lock would fail meanwhile).
 */

import { describe, it, expect } from 'bun:test';
import { upsert } from '../../client/methods/craud/upsert';
import { createObject } from '../../core/adt/craud/create';
import { oneAtATimePerGroup } from '../../core/adt/functionGroup';
import type { AdtRequestor } from '../../core/adt';
import { fakeSap, isCreate, isLock, isUnlock, loggedIn } from './fakeSap';
import type { Call } from './fakeSap';

const GROUP_URI = '/sap/bc/adt/functions/groups/zfg';

function existingGroup(rules: Parameters<typeof fakeSap>[0] = []) {
    const sap = fakeSap(rules);
    sap.objects.set(GROUP_URI, '  INCLUDE LZFGTOP.\n  INCLUDE LZFGUXX.');
    return sap;
}

function include(name: string) {
    return { name, extension: 'asfinc', container: 'ZFG', content: 'FORM x.\nENDFORM.', description: name };
}

// Delays every request to the group's includes and records how many include writes overlap
function slowIncludes(requestor: AdtRequestor): { requestor: AdtRequestor; peak: () => number } {
    const active = new Map<string, number>();
    let peak = 0;
    const includeOf = (path: string, body: string | undefined) => /\/includes\/([^/?]+)/.exec(path)?.[1] ?? /adtcore:name="([^"]+)"/.exec(body ?? '')?.[1]?.toLowerCase();
    return {
        peak: () => peak,
        requestor: {
            request: async (options) => {
                const name = options.path.includes('/includes') ? includeOf(options.path, options.body) : undefined;
                if (!name) return requestor.request(options);
                active.set(name, (active.get(name) ?? 0) + 1);
                peak = Math.max(peak, active.size);
                await Bun.sleep(5);
                const result = await requestor.request(options);
                const left = active.get(name)! - 1;
                if (left === 0) active.delete(name);
                else active.set(name, left);
                return result;
            },
        },
    };
}

describe('include create in an existing function group', () => {
    it('creates the include stateless and fills it without locking the main program', async () => {
        const sap = existingGroup();
        const [results, error] = await upsert(loggedIn(), sap.requestor, [include('LZFGF03')], '$TMP');

        expect(error).toBeNull();
        expect(results).toEqual([{ name: 'LZFGF03', extension: 'asfinc', status: 'created' }]);

        const create = sap.calls.find(isCreate)!;
        expect(create.path).toBe(`${GROUP_URI}/includes`);
        expect(create.headers['X-sap-adt-sessiontype']).toBe('stateless');

        // Only the include is locked (to fill it), and it is unlocked again
        const locked = sap.calls.filter(isLock).map(call => call.path);
        expect(locked).toEqual([`${GROUP_URI}/includes/lzfgf03`]);
        expect(sap.calls.filter(isUnlock).map(call => call.path)).toEqual(locked);
    });

    it('reports a failed create without leaving a lock behind', async () => {
        const notFound = '<exc:exception xmlns:exc="x"><localizedMessage>SAPLZFG not found</localizedMessage></exc:exception>';
        const sap = existingGroup([(call: Call) => (isCreate(call) ? new Response(notFound, { status: 500 }) : null)]);
        const [, error] = await upsert(loggedIn(), sap.requestor, [include('LZFGF03')], '$TMP');

        expect(error?.message).toContain('SAPLZFG not found');
        expect(sap.calls.filter(isLock)).toHaveLength(0);
    });

    it('writes the includes of one group one at a time', async () => {
        const sap = existingGroup();
        sap.objects.set(`${GROUP_URI}/includes/lzfgtop`, 'FUNCTION-POOL zfg.');
        const slow = slowIncludes(sap.requestor);
        const top = { ...include('LZFGTOP'), content: 'FUNCTION-POOL zfg.\nDATA gv TYPE i.' };
        const [results, error] = await upsert(loggedIn(), slow.requestor, [include('LZFGF01'), top, include('LZFGF02'), include('LZFGF03')], '$TMP');

        expect(error).toBeNull();
        expect(results!.map(r => r.status)).toEqual(['created', 'updated', 'created', 'created']);
        expect(slow.peak()).toBe(1);
    });
});

describe('oneAtATimePerGroup', () => {
    const requestor: AdtRequestor = { request: async () => [new Response(''), null] };

    it('queues includes of the same group and runs other groups and objects at once', async () => {
        const order: string[] = [];
        const step = (label: string, ms: number) => async () => {
            order.push(`start ${label}`);
            await Bun.sleep(ms);
            order.push(`end ${label}`);
            return label;
        };

        const results = await Promise.all([
            oneAtATimePerGroup(requestor, { name: 'LZAF01', extension: 'asfinc', container: 'ZA' }, step('A1', 20)),
            oneAtATimePerGroup(requestor, { name: 'LZAF02', extension: 'asfinc', container: 'za' }, step('A2', 1)),
            oneAtATimePerGroup(requestor, { name: 'LZBF01', extension: 'asfinc', container: 'ZB' }, step('B1', 1)),
            oneAtATimePerGroup(requestor, { name: 'Z_FM', extension: 'asfunc', container: 'ZA' }, step('FM', 1)),
        ]);

        expect(results).toEqual(['A1', 'A2', 'B1', 'FM']);
        expect(order.indexOf('start A2')).toBeGreaterThan(order.indexOf('end A1'));
        expect(order.indexOf('start B1')).toBeLessThan(order.indexOf('end A1'));
        expect(order.indexOf('start FM')).toBeLessThan(order.indexOf('end A1'));
    });

    it('runs the next create after a failed one', async () => {
        const failing = oneAtATimePerGroup(requestor, { name: 'LZCF01', extension: 'asfinc', container: 'ZC' }, () => Promise.reject(new Error('boom')));
        const next = oneAtATimePerGroup(requestor, { name: 'LZCF02', extension: 'asfinc', container: 'ZC' }, async () => 'ok');

        await expect(failing).rejects.toThrow('boom');
        expect(await next).toBe('ok');
    });
});

describe('create description', () => {
    it('defaults to the object name', async () => {
        const sap = fakeSap();
        const [, error] = await createObject(sap.requestor, { name: 'lzfgf09', extension: 'asfinc', container: 'ZFG', content: '' }, '$TMP', undefined, 'me');

        expect(error).toBeNull();
        expect(sap.calls[0]!.body).toContain('adtcore:description="LZFGF09"');
    });
});
