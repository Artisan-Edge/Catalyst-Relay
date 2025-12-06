/**
 * Integration Test: ABAP Program Workflow
 *
 * Tests the full lifecycle: create → activate → read → delete
 *
 * Requires environment variables:
 * - SAP_TEST_USERNAME: SAP username
 * - SAP_PASSWORD: SAP password
 *
 * Run with: bun test src/__tests__/integration/abap-program-workflow.test.ts
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

const TEST_NAME = generateTestName('ZSNAP_PROG');

// ABAP program source template
const PROGRAM_SOURCE = `REPORT ${TEST_NAME}.
WRITE: 'Hello World'.`;

describe('ABAP Program Workflow', () => {
    let client: ADTClient | null = null;
    let objectCreated = false;

    beforeAll(async () => {
        const [newClient, err] = await createTestClient();
        if (err) throw err;
        client = newClient;
    });

    afterAll(async () => {
        if (objectCreated) {
            await safeDelete(client!, [{ name: TEST_NAME, extension: 'asprog' }], TEST_CONFIG.transport);
        }
        await safeLogout(client);
    });

    it('should create an ABAP program', async () => {
        if (shouldSkip(client)) return;

        const [, createErr] = await client!.create(
            {
                name: TEST_NAME,
                extension: 'asprog',
                content: PROGRAM_SOURCE,
                description: 'Test ABAP program created by integration test',
            },
            TEST_CONFIG.package,
            TEST_CONFIG.transport
        );

        expect(createErr).toBeNull();
        objectCreated = true;
        console.log(`Created ABAP program: ${TEST_NAME}`);
    });

    it('should activate the ABAP program', async () => {
        if (shouldSkip(client) || !objectCreated) {
            console.log('Skipping - no session or program not created');
            return;
        }

        const [results, activateErr] = await client!.activate([
            { name: TEST_NAME, extension: 'asprog' }
        ]);

        expect(activateErr).toBeNull();
        expect(results).toHaveLength(1);
        expect(results![0]!.status).toBe('success');
        console.log(`Activated ABAP program: ${TEST_NAME}`);
    });

    it('should read the ABAP program source', async () => {
        if (shouldSkip(client) || !objectCreated) {
            console.log('Skipping - no session or program not created');
            return;
        }

        const [objects, readErr] = await client!.read([
            { name: TEST_NAME, extension: 'asprog' }
        ]);

        expect(readErr).toBeNull();
        expect(objects).toHaveLength(1);
        expect(objects![0]!.content).toContain('REPORT');
        expect(objects![0]!.content).toContain('Hello World');
        console.log(`Read ABAP program source: ${objects![0]!.content.substring(0, 50)}...`);
    });

    it('should delete the ABAP program', async () => {
        if (shouldSkip(client) || !objectCreated) {
            console.log('Skipping - no session or program not created');
            return;
        }

        const [, deleteErr] = await client!.delete(
            [{ name: TEST_NAME, extension: 'asprog' }],
            TEST_CONFIG.transport
        );

        expect(deleteErr).toBeNull();
        objectCreated = false;
        console.log(`Deleted ABAP program: ${TEST_NAME}`);
    });
});
