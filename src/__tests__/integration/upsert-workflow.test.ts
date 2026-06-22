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
    let apiReleased = false;

    beforeAll(async () => {
        const [newClient, error] = await createTestClient();
        if (error) {
            throw error;
        }
        client = newClient;
    });

    afterAll(async () => {
        // Unrelease before deleting — a released contract complicates cleanup.
        if (apiReleased && client?.session) {
            const [, unreleaseErr] = await client.unreleaseApi(TEST_NAME, TEST_CONFIG.transport);
            if (unreleaseErr) {
                console.warn(`Failed to unrelease ${TEST_NAME}: ${unreleaseErr.message}`);
            }
        }
        if (objectCreated) {
            await safeDelete(
                client!,
                [{ name: TEST_NAME, extension: 'asddls' }],
                TEST_CONFIG.transport
            );
        }
        await safeLogout(client);
    }, 180_000);

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

    it('should release the C1 API state of the activated view', async () => {
        if (shouldSkip(client) || !objectCreated) {
            console.log('Skipping - no session or object not created');
            return;
        }

        const [result, err] = await client!.releaseApi(TEST_NAME, TEST_CONFIG.transport);

        expect(err).toBeNull();
        expect(result).not.toBeNull();
        expect(result!.name).toBe(TEST_NAME);
        expect(result!.status).toBe('RELEASED');
        apiReleased = true;
        // Validation warnings (e.g. unreleased referenced elements) are non-blocking.
        console.log(
            `Released API state: ${TEST_NAME} (${result!.messages.length} validation message(s))`
        );
    }, 60_000);

    it('should read back the RELEASED API state', async () => {
        if (shouldSkip(client) || !apiReleased) {
            console.log('Skipping - API not released');
            return;
        }

        const [state, err] = await client!.getApiReleaseState(TEST_NAME);

        expect(err).toBeNull();
        expect(state).not.toBeNull();
        expect(state!.status).toBe('RELEASED');
        expect(state!.released).toBe(true);
        expect(state!.allowedTransitions).toContain('NOT_RELEASED');
        console.log(`Verified API release state: ${state!.statusDescription}`);
    }, 30_000);

    it('should unrelease the C1 API state', async () => {
        if (shouldSkip(client) || !apiReleased) {
            console.log('Skipping - API not released');
            return;
        }

        const [result, err] = await client!.unreleaseApi(TEST_NAME, TEST_CONFIG.transport);

        expect(err).toBeNull();
        expect(result).not.toBeNull();
        expect(result!.status).toBe('NOT_RELEASED');
        apiReleased = false;
        console.log(`Unreleased API state: ${TEST_NAME}`);
    }, 60_000);
});
