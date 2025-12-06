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
import { createClient, loadConfig } from '../../core';
import type { ADTClient } from '../../core';

// Test configuration from environment
const CLIENT_ID = process.env['SAP_TEST_CLIENT_ID'] ?? 'MediaDemo-DM1-200';
const USERNAME = process.env['SAP_TEST_USERNAME'] ?? '';
const PACKAGE_NAME = process.env['SAP_TEST_PACKAGE'] ?? '$TMP';
const TRANSPORT = process.env['SAP_TEST_TRANSPORT'] || undefined;
const TEST_VIEW_NAME = 'ZSNAP_TEST_VIEW_' + Date.now().toString(36).toUpperCase();

// CDS view source code - simple view on a standard table
const CDS_SOURCE = `@AbapCatalog.sqlViewName: '${TEST_VIEW_NAME.substring(0, 16)}'
@AbapCatalog.compiler.compareFilter: true
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Test CDS View'
define view ${TEST_VIEW_NAME} as select from t000 {
    key mandt,
    mtext
}`;

describe('CDS View Workflow', () => {
    let client: ADTClient;
    let viewCreated = false;

    beforeAll(async () => {
        // Check for required credentials
        const password = process.env['SAP_PASSWORD'];

        if (!USERNAME || !password) {
            console.log('Skipping integration tests - SAP_TEST_USERNAME and SAP_PASSWORD not set');
            return;
        }

        // Load configuration
        const [config, configErr] = loadConfig('./config.json');
        if (configErr) {
            throw new Error(`Failed to load config: ${configErr.message}`);
        }

        // Parse client ID to get system and client number
        const parts = CLIENT_ID.split('-');
        const clientNumber = parts.pop()!;
        const systemId = parts.join('-');
        const systemConfig = config.get(systemId);

        if (!systemConfig?.adt) {
            throw new Error(`System ${systemId} not found in config`);
        }

        // Create client
        const [newClient, clientErr] = createClient({
            url: systemConfig.adt,
            client: clientNumber,
            auth: { type: 'basic', username: USERNAME, password },
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

        // Cleanup: delete test view if created
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
            console.log('Skipping - no session');
            return;
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
        if (!client?.session || !viewCreated) {
            console.log('Skipping - no session or view not created');
            return;
        }

        const [results, activateErr] = await client.activate([
            { name: TEST_VIEW_NAME, extension: 'asddls' }
        ]);

        expect(activateErr).toBeNull();
        expect(results).toHaveLength(1);
        expect(results![0]!.status).toBe('success');
        console.log(`Activated CDS view: ${TEST_VIEW_NAME}`);
    });

    it('should preview data from the CDS view', async () => {
        if (!client?.session || !viewCreated) {
            console.log('Skipping - no session or view not created');
            return;
        }

        const [dataFrame, previewErr] = await client.previewData({
            objectName: TEST_VIEW_NAME,
            objectType: 'view',
            limit: 10,
        });

        expect(previewErr).toBeNull();
        expect(dataFrame).toBeDefined();
        expect(dataFrame!.columns.length).toBeGreaterThan(0);
        console.log(`Preview returned ${dataFrame!.rows.length} rows with columns: ${dataFrame!.columns.map(c => c.name).join(', ')}`);
    });

    it('should read the CDS view source', async () => {
        if (!client?.session || !viewCreated) {
            console.log('Skipping - no session or view not created');
            return;
        }

        const [objects, readErr] = await client.read([
            { name: TEST_VIEW_NAME, extension: 'asddls' }
        ]);

        expect(readErr).toBeNull();
        expect(objects).toHaveLength(1);
        expect(objects![0]!.content).toContain('define view');
        console.log(`Read CDS view source: ${objects![0]!.content.substring(0, 50)}...`);
    });
});
