/**
 * Integration Test: Data Preview Workflow
 *
 * Tests data preview operations on standard SAP tables and CDS views (read-only):
 * - previewData: Query table data with limit
 * - countRows: Count total rows in a table
 * - getDistinctValues: Get distinct values for a column (table and CDS view)
 *
 * Uses T000 standard table and I_JournalEntry CDS view which exist in all SAP systems.
 *
 * Requires environment variables:
 * - SAP_TEST_USERNAME: SAP username
 * - SAP_PASSWORD: SAP password
 *
 * Run with: bun test src/__tests__/integration/data-preview-workflow.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createTestClient, shouldSkip, safeLogout } from './test-helpers';
import type { ADTClient } from '../../core';

describe('Data Preview Workflow', () => {
    let client: ADTClient | null = null;

    beforeAll(async () => {
        const [newClient, err] = await createTestClient();
        if (err) throw err;
        client = newClient;
    });

    afterAll(async () => {
        // No cleanup needed for read-only tests
        await safeLogout(client);
    });

    it('should preview data from T000 table', async () => {
        if (shouldSkip(client)) return;

        const [dataFrame, err] = await client!.previewData({
            objectName: 'T000',
            objectType: 'table',
            sqlQuery: 'SELECT * FROM T000',
            limit: 10
        });

        expect(err).toBeNull();
        expect(dataFrame).toBeDefined();
        expect(dataFrame!.columns).toBeDefined();
        expect(dataFrame!.columns.length).toBeGreaterThan(0);
        expect(dataFrame!.rows).toBeDefined();
        expect(Array.isArray(dataFrame!.rows)).toBe(true);

        console.log(`Preview returned ${dataFrame!.rows.length} rows with ${dataFrame!.columns.length} columns`);
        console.log(`Columns: ${dataFrame!.columns.map(c => c.name).join(', ')}`);

        // Show first few rows
        if (dataFrame!.rows.length > 0) {
            console.log('Sample data:');
            dataFrame!.rows.slice(0, 3).forEach((row, i) => {
                console.log(`  Row ${i + 1}: ${JSON.stringify(row)}`);
            });
        }
    });

    it('should count rows in T000', async () => {
        if (shouldSkip(client)) return;

        const [count, err] = await client!.countRows('T000', 'table');

        expect(err).toBeNull();
        expect(count).toBeDefined();
        expect(typeof count).toBe('number');
        expect(count!).toBeGreaterThan(0);

        console.log(`T000 table has ${count} rows`);
    });

    it('should get distinct MTEXT values from T000', async () => {
        if (shouldSkip(client)) return;

        // MTEXT is the client description field in T000
        // Must specify 'table' since T000 is a table, not a CDS view
        const [result, err] = await client!.getDistinctValues('T000', [], 'MTEXT', 'table');

        expect(err).toBeNull();
        expect(result).toBeDefined();
        expect(result!.column).toBe('MTEXT');
        expect(result!.values).toBeDefined();
        expect(Array.isArray(result!.values)).toBe(true);

        console.log(`Found ${result!.values.length} distinct MTEXT values`);
        if (result!.values.length > 0) {
            console.log('Sample values:');
            result!.values.slice(0, 5).forEach(({ value, count }) => {
                console.log(`  - "${value}" (count: ${count})`);
            });
        }
    });

    it('should get distinct CompanyCode values from I_JournalEntry CDS view', async () => {
        if (shouldSkip(client)) return;

        // I_JournalEntry is a standard SAP CDS view for journal entries
        const [result, err] = await client!.getDistinctValues('I_JOURNALENTRY', [], 'CompanyCode', 'view');

        expect(err).toBeNull();
        expect(result).toBeDefined();
        expect(result!.column).toBe('CompanyCode');
        expect(result!.values).toBeDefined();
        expect(Array.isArray(result!.values)).toBe(true);

        console.log(`Found ${result!.values.length} distinct CompanyCode values from I_JournalEntry`);
        if (result!.values.length > 0) {
            console.log('Sample values:');
            result!.values.slice(0, 5).forEach(({ value, count }) => {
                console.log(`  - "${value}" (count: ${count})`);
            });
        }
    });
});
