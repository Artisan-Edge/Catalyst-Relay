/**
 * Integration Test: RAP Service Binding Workflow
 *
 * Mirrors the manual SETUP.md in
 * SNAP/.../beacon/documentation_transporting, fully automated:
 *
 *   table → read view + root view → behavior definition + pool class
 *         → service definition → service binding (create → activate → publish)
 *
 * RAP objects, a delivery-class-C table and a service binding cannot live in
 * $TMP, so this suite only runs when a transportable package + transport are
 * configured (SAP_TEST_PACKAGE != $TMP and SAP_TEST_TRANSPORT set).
 *
 * Objects are created with unique per-run names (never touching real ZBEACON_*
 * objects) and are NOT auto-deleted: a published binding can't be removed via the
 * client, and it pins the whole chain. Created names + transport are logged at the
 * end for manual cleanup.
 *
 * Run with: bun test src/__tests__/integration/service-binding-workflow.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import type { ADTClient } from '../../core';
import type { ObjectContent, ObjectRef } from '../../types/requests';
import { BehaviorImplementationType } from '../../types/requests';
import { createTestClient, safeLogout, TEST_CONFIG } from './test-helpers';

// RAP + bindings require a real package and transport (not $TMP).
const CAN_RUN = TEST_CONFIG.package !== '$TMP' && !!TEST_CONFIG.transport;

// Unique, test-namespaced names so we never collide with real ZBEACON_* objects.
const TOKEN = Date.now().toString(36).slice(-5).toUpperCase();
const TABLE = `ZCR_${TOKEN}_DOCS`;
const READ_VIEW = `ZCR_${TOKEN}_READ`;
const ROOT_VIEW = `ZCR_${TOKEN}_IF`;
const POOL_CLASS = `ZCR_${TOKEN}_BP`;
const SRVD = `ZCR_${TOKEN}_EXP`;
const BINDING = `ZCR_${TOKEN}_BND`;

// The behavior definition shares the root view's name (RAP convention).
const BDEF = ROOT_VIEW;

const TABLE_SOURCE = `@EndUserText.label : 'Catalyst test: Model Documentation'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #C
@AbapCatalog.dataMaintenance : #ALLOWED
define table ${TABLE} {
  key client     : abap.clnt not null;
  key stack      : abap.char(3) not null;
  key query      : abap.char(20) not null;
  key masterdata : abap.char(40) not null;
  documentation  : abap.string;
}`;

const READ_VIEW_SOURCE = `@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Catalyst test: Documentation Read Service'
@Metadata.ignorePropagatedAnnotations: true
define view entity ${READ_VIEW}
  as select from ${TABLE} as main
{
  key main.stack,
  key main.query,
  key main.masterdata,
  main.documentation
}`;

const ROOT_VIEW_SOURCE = `@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Catalyst test: RAP interface view'
define root view entity ${ROOT_VIEW}
  as select from ${TABLE} as main
{
  key main.stack,
  key main.query,
  key main.masterdata,
  main.documentation
}`;

const BDEF_SOURCE = `managed implementation in class ${POOL_CLASS} unique;

define behavior for ${ROOT_VIEW} alias Docs
persistent table ${TABLE}
lock master
{
  create;
  update;
  delete;

  field ( readonly : update ) stack, query, masterdata;

  mapping for ${TABLE}
  {
    stack         = stack;
    query         = query;
    masterdata    = masterdata;
    documentation = documentation;
  }
}`;

const POOL_CLASS_SOURCE = `CLASS ${POOL_CLASS} DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF ${ROOT_VIEW}.
ENDCLASS.

CLASS ${POOL_CLASS} IMPLEMENTATION.
ENDCLASS.`;

const SRVD_SOURCE = `@EndUserText.label: 'Catalyst test: Expose RAP Definition'
define service ${SRVD} {
  expose ${ROOT_VIEW}  as Docs;
  expose ${READ_VIEW}  as ReadDocs;
}`;

const ACTIVATION_TIMEOUT_MS = 60_000;

describe.skipIf(!CAN_RUN)('RAP Service Binding Workflow', () => {
    let client: ADTClient | null = null;

    beforeAll(async () => {
        const [newClient, err] = await createTestClient();
        if (err) throw err;
        client = newClient;
    });

    afterAll(async () => {
        if (!client?.session) return;

        // Tear down in dependency order: the binding pins the srvd → views → table
        // chain, so unpublish + delete it first, then multi-delete the rest (which
        // resolves its own ordering). Best-effort — log failures, never throw.
        console.log('--- Cleanup ---');
        const [, bindingErr] = await client.deleteServiceBinding(BINDING, TEST_CONFIG.transport);
        if (bindingErr) console.warn(`  Binding ${BINDING}: ${bindingErr.message}`);
        else console.log(`  Deleted binding: ${BINDING}`);

        const chain: ObjectRef[] = [
            { name: SRVD, extension: 'srvd' },
            { name: BDEF, extension: 'asbdef' },
            { name: POOL_CLASS, extension: 'aclass' },
            { name: ROOT_VIEW, extension: 'asddls' },
            { name: READ_VIEW, extension: 'asddls' },
            { name: TABLE, extension: 'astabldt' },
        ];
        const [results, deleteErr] = await client.delete(chain, TEST_CONFIG.transport);
        if (deleteErr) {
            console.warn(`  Chain delete error: ${deleteErr.message}`);
        } else {
            for (const result of results!) {
                const label = result.status === 'success' ? 'Deleted' : `FAILED (${result.message ?? ''})`;
                console.log(`  ${label}: ${result.name}`);
            }
        }

        await safeLogout(client);
    }, ACTIVATION_TIMEOUT_MS);

    async function upsert(objects: ObjectContent[]): Promise<void> {
        if (!client?.session) throw new Error('No active session');
        const [results, error] = await client.upsert(objects, TEST_CONFIG.package, TEST_CONFIG.transport);
        expect(error).toBeNull();
        expect(results).toHaveLength(objects.length);
    }

    async function activate(objects: ObjectRef[]): Promise<void> {
        if (!client?.session) throw new Error('No active session');
        const [results, error] = await client.activate(objects);
        expect(error).toBeNull();
        expect(results).toHaveLength(objects.length);
        for (const result of results!) {
            // Behavior definitions may emit warnings (e.g. settling against the pool
            // class); only errors should fail the workflow.
            expect(result.status).not.toBe('error');
        }
    }

    it('upserts and activates the table', async () => {
        await upsert([{ name: TABLE, extension: 'astabldt', content: TABLE_SOURCE, description: 'Catalyst test table' }]);
        await activate([{ name: TABLE, extension: 'astabldt' }]);
        console.log(`Table active: ${TABLE}`);
    }, ACTIVATION_TIMEOUT_MS);

    it('upserts and activates the CDS views', async () => {
        await upsert([
            { name: READ_VIEW, extension: 'asddls', content: READ_VIEW_SOURCE, description: 'Catalyst test read view' },
            { name: ROOT_VIEW, extension: 'asddls', content: ROOT_VIEW_SOURCE, description: 'Catalyst test root view' },
        ]);
        await activate([
            { name: READ_VIEW, extension: 'asddls' },
            { name: ROOT_VIEW, extension: 'asddls' },
        ]);
        console.log(`Views active: ${READ_VIEW}, ${ROOT_VIEW}`);
    }, ACTIVATION_TIMEOUT_MS);

    it('upserts the behavior definition and pool class, then activates them together', async () => {
        // Behavior definition and pool class are mutually dependent — create both
        // (inactive), then activate together so SAP can resolve the references.
        await upsert([
            {
                name: BDEF,
                extension: 'asbdef',
                content: BDEF_SOURCE,
                description: 'Catalyst test behavior definition',
                implementationType: BehaviorImplementationType.Managed,
            },
        ]);
        await upsert([
            { name: POOL_CLASS, extension: 'aclass', content: POOL_CLASS_SOURCE, description: 'Catalyst test behavior pool' },
        ]);

        await activate([
            { name: BDEF, extension: 'asbdef' },
            { name: POOL_CLASS, extension: 'aclass' },
        ]);
        console.log(`Behavior definition + pool class active: ${BDEF}, ${POOL_CLASS}`);
    }, ACTIVATION_TIMEOUT_MS);

    it('upserts and activates the service definition', async () => {
        await upsert([{ name: SRVD, extension: 'srvd', content: SRVD_SOURCE, description: 'Catalyst test service definition' }]);
        await activate([{ name: SRVD, extension: 'srvd' }]);
        console.log(`Service definition active: ${SRVD}`);
    }, ACTIVATION_TIMEOUT_MS);

    it('creates, activates and publishes the service binding', async () => {
        if (!client?.session) throw new Error('No active session');

        const [result, error] = await client.createServiceBinding({
            bindingName: BINDING,
            serviceDefinition: SRVD,
            packageName: TEST_CONFIG.package,
            description: 'Catalyst test OData V4 binding',
            transport: TEST_CONFIG.transport!,
        });

        expect(error).toBeNull();
        expect(result).not.toBeNull();
        expect(result!.created).toBe(true);
        expect(result!.published).toBe(true);
        expect(result!.activation.every(a => a.status !== 'error')).toBe(true);
        console.log(`Service binding published: ${BINDING} (${result!.publishMessage})`);
    }, ACTIVATION_TIMEOUT_MS);
});
