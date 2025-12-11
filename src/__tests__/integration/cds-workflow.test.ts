/**
 * Integration Test: CDS View Workflow
 *
 * Tests the full lifecycle: create → activate → preview → delete
 *
 * Requires environment variables:
 * - SAP_USERNAME: SAP username
 * - SAP_PASSWORD: SAP password
 *
 * Run with: bun test src/__tests__/integration/cds-workflow.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createClient } from '../../core';
import type { ADTClient } from '../../core';

// Test configuration from environment
const ADT_URL = process.env['SAP_TEST_ADT_URL'] ?? '';
const CLIENT = process.env['SAP_TEST_CLIENT'] ?? '';
const USERNAME = process.env['SAP_TEST_USERNAME'] ?? '';
const PACKAGE_NAME = process.env['SAP_TEST_PACKAGE'] ?? '$TMP';
const TRANSPORT = process.env['SAP_TEST_TRANSPORT'] || undefined;
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
    let client: ADTClient;
    let viewCreated = false;
    let dclCreated = false;

    beforeAll(async () => {
        // Validate required credentials
        const password = process.env['SAP_PASSWORD'];
        const missing: string[] = [];
        if (!ADT_URL) missing.push('SAP_TEST_ADT_URL');
        if (!CLIENT) missing.push('SAP_TEST_CLIENT');
        if (!USERNAME) missing.push('SAP_TEST_USERNAME');
        if (!password) missing.push('SAP_PASSWORD');

        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }

        // Create client directly from environment variables
        const [newClient, clientErr] = createClient({
            url: ADT_URL,
            client: CLIENT,
            auth: { type: 'basic', username: USERNAME, password: password! },
            insecure: true,
        });

        if (clientErr) {
            throw new Error(`Failed to create client: ${clientErr.message}`);
        }

        client = newClient;

        // Login
        const [session, loginErr] = await client.login();
        if (loginErr) {
            throw new Error(`Failed to login: ${loginErr.message}`);
        }

        console.log(`Logged in as ${session.username}`);
    });

    afterAll(async () => {
        if (!client?.session) return;

        // Cleanup: delete DCL first (dependency), then test view
        if (dclCreated) {
            console.log(`Cleaning up: deleting ${TEST_DCL_NAME}`);
            const [, deleteDclErr] = await client.delete(
                [{ name: TEST_DCL_NAME, extension: 'asdcls' }],
                TRANSPORT
            );
            if (deleteDclErr) {
                console.warn(`Failed to delete DCL: ${deleteDclErr.message}`);
            }
        }

        if (viewCreated) {
            console.log(`Cleaning up: deleting ${TEST_VIEW_NAME}`);
            const [, deleteErr] = await client.delete(
                [{ name: TEST_VIEW_NAME, extension: 'asddls' }],
                TRANSPORT
            );
            if (deleteErr) {
                console.warn(`Failed to delete test view: ${deleteErr.message}`);
            }
        }

        // Logout
        await client.logout();
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
            PACKAGE_NAME,
            TRANSPORT
        );

        expect(createErr).toBeNull();
        viewCreated = true;
        console.log(`Created CDS view: ${TEST_VIEW_NAME}`);
    });

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
    });

    it('should preview data from the CDS view', async () => {
        if (!client?.session) throw new Error('No active session');
        if (!viewCreated) throw new Error('View was not created - previous test failed');

        const [dataFrame, previewErr] = await client.previewData({
            objectName: TEST_VIEW_NAME,
            objectType: 'view',
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
            PACKAGE_NAME,
            TRANSPORT
        );

        expect(createErr).toBeNull();
        dclCreated = true;
        console.log(`Created DCL: ${TEST_DCL_NAME}`);
    });

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
