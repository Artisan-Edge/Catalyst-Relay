/**
 * Integration Test: Data Preview Workflow
 *
 * Tests data preview operations on standard SAP tables and CDS views (read-only):
 * - previewData: Query table data with limit
 * - countRows: Count total rows in a table
 * - getDistinctValues: Get distinct values for a column (table and CDS view)
 * - freestyleQuery: a one-line query far longer than the endpoint's 255-character lines
 *
 * Uses T000 standard table and I_JournalEntry CDS view which exist in all SAP systems.
 *
 * Requires environment variables:
 * - SAP_TEST_USERNAME: SAP username
 * - SAP_PASSWORD: SAP password
 *
 * Run with: bun test --path-ignore-patterns=node_modules/** src/__tests__/integration/data-preview-workflow.test.ts
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

    it('should run a one-line freestyle query longer than 255 characters', async () => {
        if (shouldSkip(client)) return;

        // The regression: SAP cut the body into 255-character lines mid-token ("Boolean expression
        // expected" / "Only one SELECT"); relay now wraps long lines at whitespace
        const clients = Array.from({ length: 60 }, (_, i) => `'${String(i).padStart(3, '0')}'`).join(', ');
        const sql = `SELECT mandt, mtext FROM t000 WHERE mandt IN ( ${clients} ) AND mtext <> 'keep me whole' ORDER BY mandt`;
        expect(sql.length).toBeGreaterThan(500);
        expect(sql).not.toContain('\n');

        const [dataFrame, err] = await client!.freestyleQuery(sql, 100);

        expect(err).toBeNull();
        expect(dataFrame!.columns.map(c => c.name.toUpperCase())).toEqual(['MANDT', 'MTEXT']);
        expect(dataFrame!.rows.length).toBeGreaterThan(0);
    }, 60000);

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
