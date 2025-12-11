/**
 * Integration Test: Table Workflow
 *
 * Tests the full lifecycle: create → activate → preview data → count rows → delete
 *
 * NOTE: Table creation may have different requirements than other object types.
 * This test verifies the complete workflow including data preview capabilities.
 *
 * Requires environment variables:
 * - SAP_TEST_USERNAME: SAP username
 * - SAP_PASSWORD: SAP password
 *
 * Run with: bun test src/__tests__/integration/table-workflow.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
    TEST_CONFIG,
    generateTestName,
    createTestClient,
    shouldSkip,
    safeDelete,
    safeLogout,
} from './test-helpers';
import type { ADTClient } from '../../core';

// SAP table names have a 16-character limit. Use short prefix to stay under.
const TEST_NAME = generateTestName('ZST');

// Table definition source template
// NOTE: This is a simplified table structure for testing purposes
const TABLE_SOURCE = `@EndUserText.label : 'Test Table'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #ALLOWED
define table ${TEST_NAME} {
  key client : mandt not null;
  key id     : abap.char(10) not null;
  name       : abap.char(40);
  value      : abap.int4;
}`;

describe('Table Workflow', () => {
    let client: ADTClient | null = null;
    let objectCreated = false;

    beforeAll(async () => {
        const [newClient, err] = await createTestClient();
        if (err) throw err;
        client = newClient;
    });

    afterAll(async () => {
        if (objectCreated) {
            await safeDelete(client!, [{ name: TEST_NAME, extension: 'astabldt' }], TEST_CONFIG.transport);
        }
        await safeLogout(client);
    });

    it('should create a table', async () => {
        if (shouldSkip(client)) return;

        const [, createErr] = await client!.create(
            {
                name: TEST_NAME,
                extension: 'astabldt',
                content: TABLE_SOURCE,
                description: 'Test table created by integration test',
            },
            TEST_CONFIG.package,
            TEST_CONFIG.transport
        );

        expect(createErr).toBeNull();
        objectCreated = true;
        console.log(`Created table: ${TEST_NAME}`);
    });

    it('should activate the table', async () => {
        if (shouldSkip(client) || !objectCreated) {
            console.log('Skipping - no session or table not created');
            return;
        }

        const [results, activateErr] = await client!.activate([
            { name: TEST_NAME, extension: 'astabldt' }
        ]);

        expect(activateErr).toBeNull();
        expect(results).toHaveLength(1);
        expect(results![0]!.status).toBe('success');
        console.log(`Activated table: ${TEST_NAME}`);
    });

    it('should read the table definition', async () => {
        if (shouldSkip(client) || !objectCreated) {
            console.log('Skipping - no session or table not created');
            return;
        }

        const [objects, readErr] = await client!.read([
            { name: TEST_NAME, extension: 'astabldt' }
        ]);

        expect(readErr).toBeNull();
        expect(objects).toHaveLength(1);
        expect(objects![0]!.content).toContain('define table');
        console.log(`Read table definition: ${objects![0]!.content.substring(0, 50)}...`);
    });

    it('should preview data from the table', async () => {
        if (shouldSkip(client) || !objectCreated) {
            console.log('Skipping - no session or table not created');
            return;
        }

        // NOTE: Table uses dpEndpoint: 'ddic' instead of 'cds'
        const [dataFrame, previewErr] = await client!.previewData({
            objectName: TEST_NAME,
            objectType: 'table',
            sqlQuery: `SELECT * FROM ${TEST_NAME}`,
            limit: 10,
        });

        expect(previewErr).toBeNull();
        expect(dataFrame).toBeDefined();
        expect(dataFrame!.columns.length).toBeGreaterThan(0);
        console.log(`Preview returned ${dataFrame!.rows.length} rows with columns: ${dataFrame!.columns.map(c => c.name).join(', ')}`);

        // Table will be empty initially
        if (dataFrame!.rows.length > 0) {
            console.log('Sample data:');
            dataFrame!.rows.slice(0, 3).forEach((row, i) => {
                console.log(`  Row ${i + 1}: ${JSON.stringify(row)}`);
            });
        } else {
            console.log('Table is empty (expected for newly created table)');
        }
    });

    it('should count rows in the table', async () => {
        if (shouldSkip(client) || !objectCreated) {
            console.log('Skipping - no session or table not created');
            return;
        }

        const [count, countErr] = await client!.countRows(TEST_NAME, 'table');

        expect(countErr).toBeNull();
        expect(count).toBeDefined();
        expect(count).toBeGreaterThanOrEqual(0);
        console.log(`Table row count: ${count}`);
    });

    it('should delete the table', async () => {
        if (shouldSkip(client) || !objectCreated) {
            console.log('Skipping - no session or table not created');
            return;
        }

        const [, deleteErr] = await client!.delete(
            [{ name: TEST_NAME, extension: 'astabldt' }],
            TEST_CONFIG.transport
        );

        expect(deleteErr).toBeNull();
        objectCreated = false;
        console.log(`Deleted table: ${TEST_NAME}`);
    });
});
