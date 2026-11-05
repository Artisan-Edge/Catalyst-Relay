/**
 * Integration Test: Lock Object Workflow (.asenqu)
 *
 * One upsert creates a table and a lock object on it (the lock object is created as a shell, then
 * populated: populateAfterCreate) → activate both → read the lock object back with its parameters
 * wanted → re-upsert (unchanged) → delete both in one call (lock object first).
 * Names: ZCAT_IT_<stamp>T / EZCAT_IT_<stamp>L (at most 16 characters); deleted in afterAll.
 *
 * Run with: bun test --path-ignore-patterns=node_modules/** src/__tests__/integration/enqu-workflow.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { TEST_CONFIG, createTestClient, shouldSkip, safeLogout, deleteExisting } from './test-helpers';
import type { ADTClient } from '../../core';
import type { ObjectContent, ObjectRef } from '../../types/requests';

const STAMP = Date.now().toString(36).toUpperCase().slice(-6);
const TABLE = `ZCAT_IT_${STAMP}T`;
const LOCK = `EZCAT_IT_${STAMP}L`;

const TABLE_SOURCE = `@EndUserText.label : 'Catalyst relay lock table'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #ALLOWED
define table ${TABLE.toLowerCase()} {
  key client : abap.clnt not null;
  key id     : abap.numc(10) not null;
  name       : abap.char(40);
}`;

const LOCK_SOURCE = `@EndUserText.label: 'Catalyst relay lock'
@AllowRFC: true
define lock object ${LOCK.toLowerCase()} {
    primary table : ${TABLE.toLowerCase()} lock mode E;
    lock parameters {
        client : ${TABLE.toLowerCase()}.client;
        id     : ${TABLE.toLowerCase()}.id;
    }
}`;

const OBJECTS: ObjectContent[] = [
    { name: LOCK, extension: 'asenqu', content: LOCK_SOURCE },
    // Creates need a description (the lock object takes its @EndUserText.label)
    { name: TABLE, extension: 'astabldt', content: TABLE_SOURCE, description: 'Catalyst relay lock table' },
];
const LOCK_REF: ObjectRef = { name: LOCK, extension: 'asenqu' };
const REFS: ObjectRef[] = [LOCK_REF, { name: TABLE, extension: 'astabldt' }];

describe('Lock Object Workflow', () => {
    let client: ADTClient | null = null;

    beforeAll(async () => {
        const [newClient, err] = await createTestClient();
        if (err) throw err;
        client = newClient;
    });

    afterAll(async () => {
        await safeLogout(client);
        await deleteExisting(REFS, TEST_CONFIG.transport);
    }, 120000);

    it('creates the table and the populated lock object', async () => {
        if (shouldSkip(client)) return;

        const [results, error] = await client!.upsert(OBJECTS, TEST_CONFIG.package, TEST_CONFIG.transport);
        expect(error).toBeNull();
        expect(results!.map(r => [r.name.toUpperCase(), r.status]).sort()).toEqual([[LOCK, 'created'], [TABLE, 'created']]);
    }, 120000);

    it('activates both', async () => {
        if (shouldSkip(client)) return;

        const [results, error] = await client!.activate(REFS);
        expect(error).toBeNull();
        expect(results!.every(r => r.status === 'success')).toBe(true);
    }, 120000);

    it('reads the lock object back with every parameter wanted', async () => {
        if (shouldSkip(client)) return;

        const [read, error] = await client!.read([LOCK_REF]);
        expect(error).toBeNull();
        const content = read![0]!.content.toLowerCase();
        expect(content).toContain('@allowrfc: true');
        expect(content).toMatch(new RegExp(`client\\s*: ${TABLE.toLowerCase()}\\.client;`));
        expect(content).toMatch(new RegExp(`id\\s*: ${TABLE.toLowerCase()}\\.id;`));
        expect(content).not.toContain('not wanted');
    });

    it('reports a second upsert as unchanged', async () => {
        if (shouldSkip(client)) return;

        const [results, error] = await client!.upsert(OBJECTS, TEST_CONFIG.package, TEST_CONFIG.transport);
        expect(error).toBeNull();
        expect(results!.map(r => r.status)).toEqual(['unchanged', 'unchanged']);
    }, 120000);

    it('deletes the lock object and its table in one call', async () => {
        if (shouldSkip(client)) return;

        const [results, error] = await client!.delete(REFS, TEST_CONFIG.transport);
        expect(error).toBeNull();
        expect(results!.map(r => [r.status, r.message])).toEqual([['success', undefined], ['success', undefined]]);

        const [read] = await client!.read([LOCK_REF]);
        expect(read).toBeNull();
    }, 120000);
});
