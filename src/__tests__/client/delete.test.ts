/**
 * Unit Tests for delete (client method + multi-delete) against a fake SAP
 *
 * - Parts deleted with their function group follow the group's status and message
 * - External references stop the whole call
 * - Every delete releases its lock; a failed unlock does not undo a delete
 * - A missing object is not_found without a lock or delete (SAP answers MSAG deletes with success)
 * - Generated lock modules only stand for lock objects in the set (EZA/EZB)
 * - A where-used hit from a group's generated include orders the group before the table
 */

import { describe, it, expect } from 'bun:test';
import { deleteObjects } from '../../client/methods/craud/delete';
import { ExternalReferencesError } from '../../core/adt';
import { fakeSap, isLock, isUnlock, loggedIn } from './fakeSap';
import type { Call, Rule } from './fakeSap';

interface Hit {
    name: string;
    type: string;
    uri: string;
}

function usages(hits: Hit[]): string {
    const items = hits.map(h => `<usageReferences:referencedObject uri="${h.uri}" isResult="true"><usageReferences:adtObject adtcore:name="${h.name}" adtcore:type="${h.type}"><adtcore:packageRef adtcore:name="$TMP"/></usageReferences:adtObject></usageReferences:referencedObject>`).join('');
    return `<?xml version="1.0" encoding="utf-8"?><usageReferences:usageReferenceResult xmlns:usageReferences="http://www.sap.com/adt/ris/usageReferences" xmlns:adtcore="http://www.sap.com/adt/core"><usageReferences:referencedObjects>${items}</usageReferences:referencedObjects></usageReferences:usageReferenceResult>`;
}

// Where-used answers by the object URI asked about (exact match), else none.
function whereUsed(byUri: Record<string, Hit[]>) {
    return (call: Call): Response | null => {
        if (!call.path.includes('usageReferences')) return null;
        return new Response(usages(byUri[call.params['uri'] ?? ''] ?? []), { status: 200 });
    };
}

// Every object exists (GET answers 200) unless a test says otherwise
const exists: Rule = call => (call.method === 'GET' ? new Response('', { status: 200 }) : null);

const deletes = (calls: Call[]) => calls.filter(call => call.method === 'DELETE').map(call => call.path);

const GROUP = { name: 'ZFG', extension: 'asfugr' };
const INCLUDE = { name: 'LZFGF01', extension: 'asfinc', container: 'ZFG' };
const MODULE = { name: 'Z_FM', extension: 'asfunc', container: 'ZFG' };

describe('function group delete roll-up', () => {
    it('reports parts as deleted with their group when it succeeds', async () => {
        const sap = fakeSap([exists, whereUsed({})]);
        const [results, error] = await deleteObjects(loggedIn(), sap.requestor, [GROUP, INCLUDE, MODULE]);

        expect(error).toBeNull();
        expect(deletes(sap.calls)).toEqual(['/sap/bc/adt/functions/groups/zfg']);
        expect(results).toEqual([
            { name: 'ZFG', extension: 'asfugr', status: 'success' },
            { name: 'LZFGF01', extension: 'asfinc', status: 'success', message: 'Deleted with function group ZFG' },
            { name: 'Z_FM', extension: 'asfunc', status: 'success', message: 'Deleted with function group ZFG' },
        ]);
    });

    it("fails the parts with the group's error when the group fails", async () => {
        const sap = fakeSap([exists, 
            whereUsed({}),
            call => (call.method === 'DELETE' ? new Response('<exc:exception xmlns:exc="x"><localizedMessage>Group is locked by OTHER</localizedMessage></exc:exception>', { status: 403 }) : null),
        ]);
        const [results] = await deleteObjects(loggedIn(), sap.requestor, [GROUP, INCLUDE]);

        expect(results![0]).toMatchObject({ name: 'ZFG', status: 'error' });
        expect(results![1]!.status).toBe('error');
        expect(results![1]!.message).toBe(`Not deleted: function group ZFG failed: ${results![0]!.message}`);
        expect(results![1]!.message).toContain('Group is locked by OTHER');
    });

    it('stops on an external reference without deleting anything', async () => {
        const sap = fakeSap([exists, whereUsed({ '/sap/bc/adt/functions/groups/zfg': [{ name: 'ZREPORT', type: 'PROG/P', uri: '/sap/bc/adt/programs/programs/zreport' }] })]);
        const [, error] = await deleteObjects(loggedIn(), sap.requestor, [GROUP, INCLUDE]);

        expect(error).toBeInstanceOf(ExternalReferencesError);
        expect((error as ExternalReferencesError).references[0]!.referencedBy.name).toBe('ZREPORT');
        expect(deletes(sap.calls)).toEqual([]);
    });
});

describe('lock release and missing objects', () => {
    it('keeps a delete a success when the follow-up unlock fails', async () => {
        const sap = fakeSap([exists, 
            whereUsed({}),
            call => (isUnlock(call) ? new Response('<exc:exception xmlns:exc="x"><localizedMessage>Not locked</localizedMessage></exc:exception>', { status: 500 }) : null),
        ]);
        const [results, error] = await deleteObjects(loggedIn(), sap.requestor, [{ name: 'ZMC', extension: 'asmsag' }]);

        expect(error).toBeNull();
        expect(results![0]!.status).toBe('success');
        expect(sap.calls.some(isUnlock)).toBe(true);
    });

    it('releases the lock after deleting a CDS view and an access control', async () => {
        // Before: only message classes were unlocked, so SAP kept the DDLS/DCLS lock in the session
        const sap = fakeSap([exists, whereUsed({})]);
        const [results] = await deleteObjects(loggedIn(), sap.requestor, [{ name: 'ZV', extension: 'asddls' }, { name: 'ZV', extension: 'asdcls' }]);

        expect(results!.map(r => r.status)).toEqual(['success', 'success']);
        const unlocked = sap.calls.filter(isUnlock).map(call => call.path).sort();
        expect(unlocked).toEqual(['/sap/bc/adt/acm/dcl/sources/zv/source/main', '/sap/bc/adt/ddic/ddl/sources/zv/source/main']);
    });

    it('releases the lock when the delete fails', async () => {
        const sap = fakeSap([exists, whereUsed({}), call => (call.method === 'DELETE' ? new Response('<exc:exception xmlns:exc="x"><localizedMessage>Boom</localizedMessage></exc:exception>', { status: 500 }) : null)]);
        const [results] = await deleteObjects(loggedIn(), sap.requestor, [{ name: 'ZCL', extension: 'aclass' }]);

        expect(results![0]).toMatchObject({ status: 'error' });
        expect(sap.calls.filter(isUnlock)).toHaveLength(1);
    });

    it('reports a missing object as not_found without locking or deleting it', async () => {
        // SAP answers the delete of a missing message class with 200, of a missing DDLS with a package error
        const sap = fakeSap([whereUsed({})]);
        const [results, error] = await deleteObjects(loggedIn(), sap.requestor, [{ name: 'ZMC', extension: 'asmsag' }, { name: 'zv', extension: 'asddls' }]);

        expect(error).toBeNull();
        expect(results).toEqual([
            { name: 'ZMC', extension: 'asmsag', status: 'not_found', message: 'Message Class ZMC does not exist' },
            { name: 'zv', extension: 'asddls', status: 'not_found', message: 'View ZV does not exist' },
        ]);
        expect(sap.calls.some(isLock)).toBe(false);
        expect(deletes(sap.calls)).toEqual([]);
    });

    it('reports the parts of a missing function group as not_found', async () => {
        const sap = fakeSap([whereUsed({})]);
        const [results] = await deleteObjects(loggedIn(), sap.requestor, [GROUP, INCLUDE]);

        expect(results!.map(r => r.status)).toEqual(['not_found', 'not_found']);
    });

    it('still deletes when the existence check itself fails', async () => {
        const sap = fakeSap([call => (call.method === 'GET' && !call.path.includes('usageReferences') ? new Response('boom', { status: 500 }) : null), whereUsed({})]);
        const [results] = await deleteObjects(loggedIn(), sap.requestor, [{ name: 'ZCL', extension: 'aclass' }]);

        expect(results![0]!.status).toBe('success');
        expect(deletes(sap.calls)).toEqual(['/sap/bc/adt/oo/classes/zcl/source/main']);
    });

    it('lets a missing object unblock the objects that reference it', async () => {
        // ZCL (missing) is used by ZPROG: ZPROG goes first, then ZCL is found missing
        const sap = fakeSap([
            call => (call.method === 'GET' && call.path === '/sap/bc/adt/oo/classes/zcl' ? new Response('', { status: 404 }) : null),
            exists,
            whereUsed({ '/sap/bc/adt/oo/classes/zcl': [{ name: 'ZPROG', type: 'PROG/P', uri: '/sap/bc/adt/programs/programs/zprog' }] }),
        ]);
        const [results] = await deleteObjects(loggedIn(), sap.requestor, [{ name: 'ZCL', extension: 'aclass' }, { name: 'ZPROG', extension: 'asprog' }]);

        expect(results!.map(r => `${r.name}:${r.status}`)).toEqual(['ZPROG:success', 'ZCL:not_found']);
    });
});

const TABLE = { name: 'ZT', extension: 'astabldt' };
const TABLE_URI = '/sap/bc/adt/ddic/tables/zt';
const LOCK_GROUP: Hit = { name: '/1BCDWBEN/TEN0000', type: 'FUGR/F', uri: '/sap/bc/adt/functions/groups/%2f1bcdwben%2ften0000' };
const lockModule = (lockObject: string): Hit => ({ name: `ENQUEUE_${lockObject}`, type: 'FUGR/FF', uri: `${LOCK_GROUP.uri}/fmodules/enqueue_${lockObject.toLowerCase()}` });

describe('generated lock modules', () => {
    it('deletes a table with its lock object when no other lock object uses it', async () => {
        const sap = fakeSap([exists, whereUsed({ [TABLE_URI]: [LOCK_GROUP, lockModule('EZA')] })]);
        const [results, error] = await deleteObjects(loggedIn(), sap.requestor, [TABLE, { name: 'EZA', extension: 'asenqu' }]);

        expect(error).toBeNull();
        expect(results!.every(r => r.status === 'success')).toBe(true);
        expect(deletes(sap.calls)).toEqual(['/sap/bc/adt/ddic/lockobjects/sources/eza', '/sap/bc/adt/ddic/tables/zt/source/main']);
    });

    it('is still blocked by another lock object (EZB) on the same table', async () => {
        const sap = fakeSap([exists, whereUsed({ [TABLE_URI]: [LOCK_GROUP, lockModule('EZA'), lockModule('EZB')] })]);
        const [, error] = await deleteObjects(loggedIn(), sap.requestor, [TABLE, { name: 'EZA', extension: 'asenqu' }]);

        expect(error).toBeInstanceOf(ExternalReferencesError);
        const names = (error as ExternalReferencesError).references.map(ref => ref.referencedBy.name);
        expect(names).toContain('ENQUEUE_EZB');
        expect(names).not.toContain('ENQUEUE_EZA');
        expect(deletes(sap.calls)).toEqual([]);
    });

    it('does not ignore a generated group hit that no lock module in the set accounts for', async () => {
        // Before: any /1BCDWBEN/ hit was dropped as soon as some lock object was in the set.
        const sap = fakeSap([exists, whereUsed({ [TABLE_URI]: [LOCK_GROUP] })]);
        const [, error] = await deleteObjects(loggedIn(), sap.requestor, [TABLE, { name: 'EZA', extension: 'asenqu' }]);

        expect(error).toBeInstanceOf(ExternalReferencesError);
        expect((error as ExternalReferencesError).references[0]!.referencedBy.name).toBe('/1BCDWBEN/TEN0000');
    });

    it('does not ignore the generated group when no lock object is in the set', async () => {
        const sap = fakeSap([exists, whereUsed({ [TABLE_URI]: [LOCK_GROUP] })]);
        const [, error] = await deleteObjects(loggedIn(), sap.requestor, [TABLE]);

        expect(error).toBeInstanceOf(ExternalReferencesError);
    });
});

describe('table with its maintenance function group', () => {
    it("maps the group's generated include hit to the group and deletes the group first", async () => {
        const sap = fakeSap([exists, whereUsed({
            [TABLE_URI]: [
                { name: 'LZCAT_FGT00', type: 'FUGR/I', uri: '/sap/bc/adt/functions/groups/zcat_fg/includes/lzcat_fgt00' },
                { name: 'TABLEFRAME_ZCAT_FG', type: 'FUGR/FF', uri: '/sap/bc/adt/functions/groups/zcat_fg/fmodules/tableframe_zcat_fg' },
            ],
        })]);
        const [results, error] = await deleteObjects(loggedIn(), sap.requestor, [TABLE, { name: 'ZCAT_FG', extension: 'asfugr' }]);

        expect(error).toBeNull();
        expect(results!.every(r => r.status === 'success')).toBe(true);
        expect(deletes(sap.calls)).toEqual(['/sap/bc/adt/functions/groups/zcat_fg', '/sap/bc/adt/ddic/tables/zt/source/main']);
    });

    it('maps an include hit without a URI by its L<group>xxx name', async () => {
        const sap = fakeSap([exists, whereUsed({ [TABLE_URI]: [{ name: 'LZCAT_FGT00', type: 'PROG/I', uri: '' }] })]);
        const [, error] = await deleteObjects(loggedIn(), sap.requestor, [TABLE, { name: 'ZCAT_FG', extension: 'asfugr' }]);

        expect(error).toBeNull();
        expect(deletes(sap.calls)[0]).toBe('/sap/bc/adt/functions/groups/zcat_fg');
    });
});
