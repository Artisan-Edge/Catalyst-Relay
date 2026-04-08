/**
 * Integration Test: Transport Lifecycle Workflow
 *
 * Tests the full transport lifecycle:
 * 1. Create two transports up front (avoids SAP lock issues from create-after-delete)
 * 2. Delete the first transport immediately
 * 3. Create objects of all types on the second transport → activate them
 * 4. Delete the objects → delete the transport
 *
 * Requires a transportable package (not $TMP).
 *
 * Run with: bun test src/__tests__/integration/transport-lifecycle.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
    TEST_CONFIG,
    createTestClient,
    shouldSkip,
    safeDelete,
    safeLogout,
} from './test-helpers';
import type { ADTClient } from '../../core';

// Shared suffix for all test names in this run
const SUFFIX = Date.now().toString(36).toUpperCase();

// Object names (tables/structures have 16-char limit)
const CDS_NAME = `ZSNAP_T_${SUFFIX}`;
const DCL_NAME = `ZSNAP_TD${SUFFIX}`;
const TABLE_NAME = `ZST_${SUFFIX}`;
const CLASS_NAME = `ZSNAP_TC${SUFFIX}`;
const PROG_NAME = `ZSNAP_TP${SUFFIX}`;

// ── Source templates ──

const CDS_SOURCE = `@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Transport Test CDS View'
define view entity ${CDS_NAME} as select from t000 {
    key mandt,
    mtext
}`;

const DCL_SOURCE = `@EndUserText.label: 'Transport Test Access Control'
@MappingRole: true
define role ${DCL_NAME} {
    grant select on ${CDS_NAME}
    where mandt = aspect user;
}`;

const TABLE_SOURCE = `@EndUserText.label : 'Transport Test Table'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #ALLOWED
define table ${TABLE_NAME} {
  key client : mandt not null;
  key id     : abap.char(10) not null;
}`;

const CLASS_SOURCE = `CLASS ${CLASS_NAME} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS: test_method.
ENDCLASS.

CLASS ${CLASS_NAME} IMPLEMENTATION.
  METHOD test_method.
    " Transport lifecycle test
  ENDMETHOD.
ENDCLASS.`;

const PROG_SOURCE = `REPORT ${PROG_NAME}.
WRITE: 'Transport lifecycle test'.`;

describe('Transport Lifecycle Workflow', () => {
    let client: ADTClient | null = null;
    let throwawayTransportId: string | null = null;
    let workingTransportId: string | null = null;

    // Track created objects for cleanup
    const created = {
        cds: false,
        dcl: false,
        table: false,
        class: false,
        program: false,
    };

    beforeAll(async () => {
        const [newClient, err] = await createTestClient();
        if (err) throw err;
        client = newClient;

        if (TEST_CONFIG.package === '$TMP') {
            throw new Error('Transport tests require a transportable package (not $TMP). Set SAP_TEST_PACKAGE.');
        }
    });

    afterAll(async () => {
        if (!client?.session) return;

        // Cleanup: delete objects in dependency order (DCL before CDS)
        const transport = workingTransportId ?? undefined;
        if (created.dcl) await safeDelete(client, [{ name: DCL_NAME, extension: 'asdcls' }], transport);
        if (created.cds) await safeDelete(client, [{ name: CDS_NAME, extension: 'asddls' }], transport);
        if (created.table) await safeDelete(client, [{ name: TABLE_NAME, extension: 'astabldt' }], transport);
        if (created.class) await safeDelete(client, [{ name: CLASS_NAME, extension: 'aclass' }], transport);
        if (created.program) await safeDelete(client, [{ name: PROG_NAME, extension: 'asprog' }], transport);

        // Cleanup: delete transports if still around
        if (throwawayTransportId) {
            const [, deleteErr] = await client.deleteTransport(throwawayTransportId, true);
            if (deleteErr) console.warn(`Cleanup: failed to delete throwaway transport: ${deleteErr.message}`);
        }
        if (workingTransportId) {
            const [, deleteErr] = await client.deleteTransport(workingTransportId, true);
            if (deleteErr) console.warn(`Cleanup: failed to delete working transport: ${deleteErr.message}`);
        }

        await safeLogout(client);
    });

    // ── Phase 1: Create both transports up front ─────────────────────────

    it('should create the throwaway transport', async () => {
        if (shouldSkip(client)) return;

        const [transportId, err] = await client!.createTransport({
            package: TEST_CONFIG.package,
            description: 'Transport lifecycle test (throwaway)',
        });

        expect(err).toBeNull();
        expect(transportId).toBeTruthy();
        throwawayTransportId = transportId!;
        console.log(`Created throwaway transport: ${throwawayTransportId}`);
    });

    it('should create the working transport', async () => {
        if (shouldSkip(client)) return;

        const [transportId, err] = await client!.createTransport({
            package: TEST_CONFIG.package,
            description: 'Transport lifecycle test (with objects)',
        });

        expect(err).toBeNull();
        expect(transportId).toBeTruthy();
        workingTransportId = transportId!;
        console.log(`Created working transport: ${workingTransportId}`);
    });

    // ── Phase 2: Delete the throwaway transport ──────────────────────────

    it('should delete the throwaway transport', async () => {
        if (shouldSkip(client)) return;
        if (!throwawayTransportId) throw new Error('Throwaway transport was not created');

        const [, err] = await client!.deleteTransport(throwawayTransportId);

        expect(err).toBeNull();
        console.log(`Deleted throwaway transport: ${throwawayTransportId}`);
        throwawayTransportId = null;
    });

    // ── Phase 3: Create objects of all types on the working transport ────

    it('should create a CDS view', async () => {
        if (shouldSkip(client)) return;
        if (!workingTransportId) throw new Error('Working transport was not created');

        const [, err] = await client!.create(
            {
                name: CDS_NAME,
                extension: 'asddls',
                content: CDS_SOURCE,
                description: 'Transport test CDS view',
            },
            TEST_CONFIG.package,
            workingTransportId
        );

        expect(err).toBeNull();
        created.cds = true;
        console.log(`Created CDS view: ${CDS_NAME}`);
    });

    it('should create an access control', async () => {
        if (shouldSkip(client)) return;
        if (!workingTransportId) throw new Error('Working transport was not created');

        const [, err] = await client!.create(
            {
                name: DCL_NAME,
                extension: 'asdcls',
                content: DCL_SOURCE,
                description: 'Transport test access control',
            },
            TEST_CONFIG.package,
            workingTransportId
        );

        expect(err).toBeNull();
        created.dcl = true;
        console.log(`Created access control: ${DCL_NAME}`);
    });

    it('should create a table', async () => {
        if (shouldSkip(client)) return;
        if (!workingTransportId) throw new Error('Working transport was not created');

        const [, err] = await client!.create(
            {
                name: TABLE_NAME,
                extension: 'astabldt',
                content: TABLE_SOURCE,
                description: 'Transport test table',
            },
            TEST_CONFIG.package,
            workingTransportId
        );

        expect(err).toBeNull();
        created.table = true;
        console.log(`Created table: ${TABLE_NAME}`);
    });

    it('should create an ABAP class', async () => {
        if (shouldSkip(client)) return;
        if (!workingTransportId) throw new Error('Working transport was not created');

        const [, err] = await client!.create(
            {
                name: CLASS_NAME,
                extension: 'aclass',
                content: CLASS_SOURCE,
                description: 'Transport test ABAP class',
            },
            TEST_CONFIG.package,
            workingTransportId
        );

        expect(err).toBeNull();
        created.class = true;
        console.log(`Created ABAP class: ${CLASS_NAME}`);
    });

    it('should create an ABAP program', async () => {
        if (shouldSkip(client)) return;
        if (!workingTransportId) throw new Error('Working transport was not created');

        const [, err] = await client!.create(
            {
                name: PROG_NAME,
                extension: 'asprog',
                content: PROG_SOURCE,
                description: 'Transport test ABAP program',
            },
            TEST_CONFIG.package,
            workingTransportId
        );

        expect(err).toBeNull();
        created.program = true;
        console.log(`Created ABAP program: ${PROG_NAME}`);
    });

    // ── Phase 4: Activate all objects ─────────────────────────────────────

    it('should activate the CDS view', async () => {
        if (shouldSkip(client)) return;
        if (!created.cds) throw new Error('CDS view was not created');

        const [results, err] = await client!.activate([
            { name: CDS_NAME, extension: 'asddls' }
        ]);

        expect(err).toBeNull();
        expect(results).toHaveLength(1);
        expect(results![0]!.status).toBe('success');
        console.log(`Activated CDS view: ${CDS_NAME}`);
    }, 15000);

    it('should activate the access control', async () => {
        if (shouldSkip(client)) return;
        if (!created.dcl) throw new Error('Access control was not created');

        const [results, err] = await client!.activate([
            { name: DCL_NAME, extension: 'asdcls' }
        ]);

        expect(err).toBeNull();
        expect(results).toHaveLength(1);
        expect(results![0]!.status).toBe('success');
        console.log(`Activated access control: ${DCL_NAME}`);
    }, 15000);

    it('should activate the table', async () => {
        if (shouldSkip(client)) return;
        if (!created.table) throw new Error('Table was not created');

        const [results, err] = await client!.activate([
            { name: TABLE_NAME, extension: 'astabldt' }
        ]);

        expect(err).toBeNull();
        expect(results).toHaveLength(1);
        expect(results![0]!.status).toBe('success');
        console.log(`Activated table: ${TABLE_NAME}`);
    }, 15000);

    it('should activate the ABAP class', async () => {
        if (shouldSkip(client)) return;
        if (!created.class) throw new Error('ABAP class was not created');

        const [results, err] = await client!.activate([
            { name: CLASS_NAME, extension: 'aclass' }
        ]);

        expect(err).toBeNull();
        expect(results).toHaveLength(1);
        expect(results![0]!.status).toBe('success');
        console.log(`Activated ABAP class: ${CLASS_NAME}`);
    }, 15000);

    it('should activate the ABAP program', async () => {
        if (shouldSkip(client)) return;
        if (!created.program) throw new Error('ABAP program was not created');

        const [results, err] = await client!.activate([
            { name: PROG_NAME, extension: 'asprog' }
        ]);

        expect(err).toBeNull();
        expect(results).toHaveLength(1);
        expect(results![0]!.status).toBe('success');
        console.log(`Activated ABAP program: ${PROG_NAME}`);
    }, 15000);

    // ── Phase 5: Delete all objects (DCL before CDS due to dependency) ───

    it('should delete the access control', async () => {
        if (shouldSkip(client)) return;
        if (!created.dcl) throw new Error('Access control was not created');

        const [, err] = await client!.delete(
            [{ name: DCL_NAME, extension: 'asdcls' }],
            workingTransportId ?? undefined
        );

        expect(err).toBeNull();
        created.dcl = false;
        console.log(`Deleted access control: ${DCL_NAME}`);
    });

    it('should delete the CDS view', async () => {
        if (shouldSkip(client)) return;
        if (!created.cds) throw new Error('CDS view was not created');

        const [, err] = await client!.delete(
            [{ name: CDS_NAME, extension: 'asddls' }],
            workingTransportId ?? undefined
        );

        expect(err).toBeNull();
        created.cds = false;
        console.log(`Deleted CDS view: ${CDS_NAME}`);
    });

    it('should delete the table', async () => {
        if (shouldSkip(client)) return;
        if (!created.table) throw new Error('Table was not created');

        const [, err] = await client!.delete(
            [{ name: TABLE_NAME, extension: 'astabldt' }],
            workingTransportId ?? undefined
        );

        expect(err).toBeNull();
        created.table = false;
        console.log(`Deleted table: ${TABLE_NAME}`);
    });

    it('should delete the ABAP class', async () => {
        if (shouldSkip(client)) return;
        if (!created.class) throw new Error('ABAP class was not created');

        const [, err] = await client!.delete(
            [{ name: CLASS_NAME, extension: 'aclass' }],
            workingTransportId ?? undefined
        );

        expect(err).toBeNull();
        created.class = false;
        console.log(`Deleted ABAP class: ${CLASS_NAME}`);
    });

    it('should delete the ABAP program', async () => {
        if (shouldSkip(client)) return;
        if (!created.program) throw new Error('ABAP program was not created');

        const [, err] = await client!.delete(
            [{ name: PROG_NAME, extension: 'asprog' }],
            workingTransportId ?? undefined
        );

        expect(err).toBeNull();
        created.program = false;
        console.log(`Deleted ABAP program: ${PROG_NAME}`);
    });

    // ── Phase 6: Delete the working transport ─────────────────────────────

    it('should delete the working transport', async () => {
        if (shouldSkip(client)) return;
        if (!workingTransportId) throw new Error('Working transport was not created');

        const [, err] = await client!.deleteTransport(workingTransportId, true);

        expect(err).toBeNull();
        console.log(`Deleted working transport: ${workingTransportId}`);
        workingTransportId = null;
    });
});
