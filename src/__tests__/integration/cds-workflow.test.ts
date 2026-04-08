/**
 * Integration Test: CDS View Workflow
 *
 * Tests the full lifecycle: create → activate → preview → delete
 *
 * Run with: bun test src/__tests__/integration/cds-workflow.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import type { ADTClient } from '../../core';
import { createTestClient, safeDelete, safeLogout, TEST_CONFIG } from './test-helpers';

const TEST_VIEW_NAME = 'ZSNAP_TEST_' + Date.now().toString(36).toUpperCase();
const TEST_DCL_NAME = TEST_VIEW_NAME + '_DCL';

// CDS view entity - no sqlViewName annotation needed
const CDS_SOURCE = `@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Test CDS View Entity'
define view entity ${TEST_VIEW_NAME} as select from t000 {
    key mandt,
    mtext
}`;

// DCL (Access Control) source
const DCL_SOURCE = `@EndUserText.label: 'Test Access Control'
@MappingRole: true
define role ${TEST_DCL_NAME} {
    grant select on ${TEST_VIEW_NAME}
    where mandt = aspect user;
}`;

describe('CDS View Workflow', () => {
    let client: ADTClient | null = null;
    let viewCreated = false;
    let dclCreated = false;

    beforeAll(async () => {
        const [newClient, err] = await createTestClient();
        if (err) throw err;
        client = newClient;
    });

    afterAll(async () => {
        if (!client?.session) return;

        // Cleanup: delete DCL first (dependency), then test view
        if (dclCreated) {
            await safeDelete(client, [{ name: TEST_DCL_NAME, extension: 'asdcls' }], TEST_CONFIG.transport);
        }
        if (viewCreated) {
            await safeDelete(client, [{ name: TEST_VIEW_NAME, extension: 'asddls' }], TEST_CONFIG.transport);
        }

        await safeLogout(client);
    });

    it('should create a CDS view', async () => {
        if (!client?.session) {
            throw new Error('No active session - login may have failed');
        }

        const [, createErr] = await client.create(
            {
                name: TEST_VIEW_NAME,
                extension: 'asddls',
                content: CDS_SOURCE,
                description: 'Test CDS view created by integration test',
            },
            TEST_CONFIG.package,
            TEST_CONFIG.transport
        );

        expect(createErr).toBeNull();
        viewCreated = true;
        console.log(`Created CDS view: ${TEST_VIEW_NAME}`);
    });

    it('should appear in inactive objects after create (before activation)', async () => {
        if (!client?.session) throw new Error('No active session');
        if (!viewCreated) throw new Error('View was not created - previous test failed');

        const [entries, err] = await client.getInactiveObjects();

        expect(err).toBeNull();
        expect(entries).toBeDefined();
        expect(entries!.length).toBeGreaterThan(0);

        // Find our newly created view in the inactive list
        const ourEntry = entries!.find(e =>
            e.object?.ref.name === TEST_VIEW_NAME
        );

        expect(ourEntry).toBeDefined();
        expect(ourEntry!.object).toBeDefined();
        expect(ourEntry!.object!.ref.type).toBe('DDLS/DF');
        expect(typeof ourEntry!.object!.deleted).toBe('boolean');
        console.log(`Found ${TEST_VIEW_NAME} in inactive objects (deleted: ${ourEntry!.object!.deleted}, user: ${ourEntry!.object!.user})`);

        // Log overall counts
        const withObjects = entries!.filter(e => e.object);
        const withTransports = entries!.filter(e => e.transport);
        console.log(`Total inactive entries: ${entries!.length} (${withObjects.length} objects, ${withTransports.length} transports)`);
    });

    it('should syntax check the CDS view (clean)', async () => {
        if (!client?.session) throw new Error('No active session');
        if (!viewCreated) throw new Error('View was not created - previous test failed');

        const [results, checkErr] = await client.checkSyntax([
            { name: TEST_VIEW_NAME, extension: 'asddls' }
        ]);

        expect(checkErr).toBeNull();
        expect(results).toHaveLength(1);
        expect(results![0]!.status).toBe('success');
        console.log(`Syntax check passed for CDS view: ${TEST_VIEW_NAME}`);
    }, 15000);

    it('should activate the CDS view', async () => {
        if (!client?.session) throw new Error('No active session');
        if (!viewCreated) throw new Error('View was not created - previous test failed');

        const [results, activateErr] = await client.activate([
            { name: TEST_VIEW_NAME, extension: 'asddls' }
        ]);

        expect(activateErr).toBeNull();
        expect(results).toHaveLength(1);
        expect(results![0]!.status).toBe('success');
        console.log(`Activated CDS view: ${TEST_VIEW_NAME}`);
    }, 15000);

    it('should preview data from the CDS view', async () => {
        if (!client?.session) throw new Error('No active session');
        if (!viewCreated) throw new Error('View was not created - previous test failed');

        const [dataFrame, previewErr] = await client.previewData({
            objectName: TEST_VIEW_NAME,
            objectType: 'view',
            sqlQuery: `SELECT * FROM ${TEST_VIEW_NAME}`,
            limit: 10,
        });

        expect(previewErr).toBeNull();
        expect(dataFrame).toBeDefined();
        expect(dataFrame!.columns.length).toBeGreaterThan(0);
        console.log(`Preview returned ${dataFrame!.rows.length} rows with columns: ${dataFrame!.columns.map(c => c.name).join(', ')}`);
        // Show first few rows of data
        console.log('Sample data:');
        dataFrame!.rows.slice(0, 3).forEach((row, i) => {
            console.log(`  Row ${i + 1}: ${JSON.stringify(row)}`);
        });
    });

    it('should read the CDS view source', async () => {
        if (!client?.session) throw new Error('No active session');
        if (!viewCreated) throw new Error('View was not created - previous test failed');

        const [objects, readErr] = await client.read([
            { name: TEST_VIEW_NAME, extension: 'asddls' }
        ]);

        expect(readErr).toBeNull();
        expect(objects).toHaveLength(1);
        expect(objects![0]!.content).toContain('define view');
        console.log(`Read CDS view source: ${objects![0]!.content.substring(0, 50)}...`);
    });

    it('should create an access control for the CDS view', async () => {
        if (!client?.session) throw new Error('No active session');
        if (!viewCreated) throw new Error('View was not created - previous test failed');

        const [, createErr] = await client.create(
            {
                name: TEST_DCL_NAME,
                extension: 'asdcls',
                content: DCL_SOURCE,
                description: 'Test DCL created by integration test',
            },
            TEST_CONFIG.package,
            TEST_CONFIG.transport
        );

        expect(createErr).toBeNull();
        dclCreated = true;
        console.log(`Created DCL: ${TEST_DCL_NAME}`);
    });

    it('should syntax check the access control (clean)', async () => {
        if (!client?.session) throw new Error('No active session');
        if (!dclCreated) throw new Error('DCL was not created - previous test failed');

        const [results, checkErr] = await client.checkSyntax([
            { name: TEST_DCL_NAME, extension: 'asdcls' }
        ]);

        expect(checkErr).toBeNull();
        expect(results).toHaveLength(1);
        expect(results![0]!.status).not.toBe('error');
        console.log(`Syntax check passed for DCL: ${TEST_DCL_NAME} (status: ${results![0]!.status})`);
    }, 15000);

    it('should activate the access control', async () => {
        if (!client?.session) throw new Error('No active session');
        if (!dclCreated) throw new Error('DCL was not created - previous test failed');

        const [results, activateErr] = await client.activate([
            { name: TEST_DCL_NAME, extension: 'asdcls' }
        ]);

        expect(activateErr).toBeNull();
        expect(results).toHaveLength(1);
        expect(results![0]!.status).toBe('success');
        console.log(`Activated DCL: ${TEST_DCL_NAME}`);
    });

    it('should read the access control source', async () => {
        if (!client?.session) throw new Error('No active session');
        if (!dclCreated) throw new Error('DCL was not created - previous test failed');

        const [objects, readErr] = await client.read([
            { name: TEST_DCL_NAME, extension: 'asdcls' }
        ]);

        expect(readErr).toBeNull();
        expect(objects).toHaveLength(1);
        expect(objects![0]!.content).toContain('define role');
        expect(objects![0]!.content).toContain(TEST_VIEW_NAME);
        console.log(`Read DCL source: ${objects![0]!.content.substring(0, 50)}...`);
    });
});
