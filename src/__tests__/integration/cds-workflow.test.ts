/**
 * Integration Test: CDS View Workflow
 *
 * Tests the full lifecycle: create → activate → preview → delete
 *
 * Run with: bun test src/__tests__/integration/cds-workflow.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import type { ADTClient } from '../../core';
import { createTestClient, safeLogout, TEST_CONFIG } from './test-helpers';

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
            console.log(`Cleaning up: deleting ${TEST_DCL_NAME}`);
            const [, deleteDclErr] = await client.delete(
                [{ name: TEST_DCL_NAME, extension: 'asdcls' }],
                TEST_CONFIG.transport
            );
            if (deleteDclErr) {
                console.warn(`Failed to delete DCL: ${deleteDclErr.message}`);
            }
        }

        if (viewCreated) {
            console.log(`Cleaning up: deleting ${TEST_VIEW_NAME}`);
            const [, deleteErr] = await client.delete(
                [{ name: TEST_VIEW_NAME, extension: 'asddls' }],
                TEST_CONFIG.transport
            );
            if (deleteErr) {
                console.warn(`Failed to delete test view: ${deleteErr.message}`);
            }
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
