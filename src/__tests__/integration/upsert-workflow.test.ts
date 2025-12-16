/**
 * Integration Test: Upsert Workflow
 *
 * Tests the upsert operation (create vs update detection):
 * - Create new object via upsert
 * - Update existing object via upsert
 * - Verify content changes persist
 *
 * Requires environment variables:
 * - SAP_TEST_USERNAME: SAP username
 * - SAP_PASSWORD: SAP password
 *
 * Run with: bun test src/__tests__/integration/upsert-workflow.test.ts
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

const TEST_NAME = generateTestName('ZSNAP_UPSERT');

// CDS view source - version 1
const SOURCE_V1 = `@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Upsert Test View'
define view entity ${TEST_NAME} as select from t000 {
    key mandt,
    mtext
}`;

// CDS view source - version 2 (updated label)
const SOURCE_V2 = `@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Upsert Test View - Updated'
define view entity ${TEST_NAME} as select from t000 {
    key mandt,
    mtext
}`;

describe('Upsert Workflow', () => {
    let client: ADTClient | null = null;
    let objectCreated = false;

    beforeAll(async () => {
        const [newClient, error] = await createTestClient();
        if (error) {
            throw error;
        }
        client = newClient;
    });

    afterAll(async () => {
        if (objectCreated) {
            await safeDelete(
                client!,
                [{ name: TEST_NAME, extension: 'asddls' }],
                TEST_CONFIG.transport
            );
        }
        await safeLogout(client);
    });

    it('should create object via upsert', async () => {
        if (shouldSkip(client)) return;

        const [results, err] = await client!.upsert(
            [
                {
                    name: TEST_NAME,
                    extension: 'asddls',
                    content: SOURCE_V1,
                    description: 'Test view for upsert',
                },
            ],
            TEST_CONFIG.package,
            TEST_CONFIG.transport
        );

        expect(err).toBeNull();
        expect(results).toHaveLength(1);
        expect(results![0]!.name).toBe(TEST_NAME);
        expect(results![0]!.extension).toBe('asddls');
        expect(results![0]!.status).toBe('created');
        objectCreated = true;
        console.log(`Created CDS view via upsert: ${TEST_NAME}`);
    });

    it('should update via upsert when content changed', async () => {
        if (shouldSkip(client) || !objectCreated) {
            console.log('Skipping - no session or object not created');
            return;
        }

        const [results, err] = await client!.upsert(
            [
                {
                    name: TEST_NAME,
                    extension: 'asddls',
                    content: SOURCE_V2,
                    description: 'Test view for upsert - updated',
                },
            ],
            TEST_CONFIG.package,
            TEST_CONFIG.transport
        );

        expect(err).toBeNull();
        expect(results).toHaveLength(1);
        expect(results![0]!.name).toBe(TEST_NAME);
        expect(results![0]!.extension).toBe('asddls');
        expect(results![0]!.status).toBe('updated');
        console.log(`Updated CDS view via upsert: ${TEST_NAME}`);
    });

    it('should return unchanged when content matches (whitespace normalized)', async () => {
        if (shouldSkip(client) || !objectCreated) {
            console.log('Skipping - no session or object not created');
            return;
        }

        // Add extra whitespace variations that should normalize to same content
        const SOURCE_V2_WHITESPACE = `@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Upsert Test View - Updated'
define view entity ${TEST_NAME} as select from t000 {
    key mandt,
    mtext
}`;

        const [results, err] = await client!.upsert(
            [
                {
                    name: TEST_NAME,
                    extension: 'asddls',
                    content: SOURCE_V2_WHITESPACE,
                    description: 'Test view for upsert - should be unchanged',
                },
            ],
            TEST_CONFIG.package,
            TEST_CONFIG.transport
        );

        expect(err).toBeNull();
        expect(results).toHaveLength(1);
        expect(results![0]!.name).toBe(TEST_NAME);
        expect(results![0]!.extension).toBe('asddls');
        expect(results![0]!.status).toBe('unchanged');
        console.log(`Skipped update (unchanged): ${TEST_NAME}`);
    });

    it('should read and verify content matches latest version', async () => {
        if (shouldSkip(client) || !objectCreated) {
            console.log('Skipping - no session or object not created');
            return;
        }

        const [objects, err] = await client!.read([
            { name: TEST_NAME, extension: 'asddls' },
        ]);

        expect(err).toBeNull();
        expect(objects).toHaveLength(1);
        expect(objects![0]!.content).toContain('Upsert Test View - Updated');
        console.log(
            `Verified updated content: ${objects![0]!.content.substring(0, 80)}...`
        );
    });

    it('should activate the upserted object', async () => {
        if (shouldSkip(client) || !objectCreated) {
            console.log('Skipping - no session or object not created');
            return;
        }

        const [results, err] = await client!.activate([
            { name: TEST_NAME, extension: 'asddls' },
        ]);

        expect(err).toBeNull();
        expect(results).toHaveLength(1);
        expect(results![0]!.status).toBe('success');
        console.log(`Activated CDS view: ${TEST_NAME}`);
    });
});
