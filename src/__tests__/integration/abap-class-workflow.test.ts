/**
 * Integration Test: ABAP Class Workflow
 *
 * Tests the full lifecycle: create → activate → read → update → delete
 *
 * Requires environment variables:
 * - SAP_TEST_USERNAME: SAP username
 * - SAP_PASSWORD: SAP password
 *
 * Run with: bun test src/__tests__/integration/abap-class-workflow.test.ts
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

const TEST_NAME = generateTestName('ZSNAP_CLASS');

// ABAP class source template
const CLASS_SOURCE = `CLASS ${TEST_NAME} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS: hello_world.
ENDCLASS.

CLASS ${TEST_NAME} IMPLEMENTATION.
  METHOD hello_world.
    " Test method
  ENDMETHOD.
ENDCLASS.`;

// Updated class source for update test
const UPDATED_CLASS_SOURCE = `CLASS ${TEST_NAME} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS: hello_world.
ENDCLASS.

CLASS ${TEST_NAME} IMPLEMENTATION.
  METHOD hello_world.
    " Updated test method with changes
    DATA(lv_message) = 'Hello from updated class'.
  ENDMETHOD.
ENDCLASS.`;

describe('ABAP Class Workflow', () => {
    let client: ADTClient | null = null;
    let objectCreated = false;

    beforeAll(async () => {
        const [newClient, err] = await createTestClient();
        if (err) throw err;
        client = newClient;
    });

    afterAll(async () => {
        if (objectCreated) {
            await safeDelete(client!, [{ name: TEST_NAME, extension: 'aclass' }], TEST_CONFIG.transport);
        }
        await safeLogout(client);
    });

    it('should create an ABAP class', async () => {
        if (shouldSkip(client)) return;

        const [, createErr] = await client!.create(
            {
                name: TEST_NAME,
                extension: 'aclass',
                content: CLASS_SOURCE,
                description: 'Test ABAP class created by integration test',
            },
            TEST_CONFIG.package,
            TEST_CONFIG.transport
        );

        expect(createErr).toBeNull();
        objectCreated = true;
        console.log(`Created ABAP class: ${TEST_NAME}`);
    });

    it('should activate the ABAP class', async () => {
        if (shouldSkip(client) || !objectCreated) {
            console.log('Skipping - no session or class not created');
            return;
        }

        const [results, activateErr] = await client!.activate([
            { name: TEST_NAME, extension: 'aclass' }
        ]);

        expect(activateErr).toBeNull();
        expect(results).toHaveLength(1);
        expect(results![0]!.status).toBe('success');
        console.log(`Activated ABAP class: ${TEST_NAME}`);
    });

    it('should read the ABAP class source', async () => {
        if (shouldSkip(client) || !objectCreated) {
            console.log('Skipping - no session or class not created');
            return;
        }

        const [objects, readErr] = await client!.read([
            { name: TEST_NAME, extension: 'aclass' }
        ]);

        expect(readErr).toBeNull();
        expect(objects).toHaveLength(1);
        expect(objects![0]!.content).toContain('CLASS');
        expect(objects![0]!.content).toContain('hello_world');
        console.log(`Read ABAP class source: ${objects![0]!.content.substring(0, 50)}...`);
    });

    it('should update the ABAP class', async () => {
        if (shouldSkip(client) || !objectCreated) {
            console.log('Skipping - no session or class not created');
            return;
        }

        const [, updateErr] = await client!.update(
            {
                name: TEST_NAME,
                extension: 'aclass',
                content: UPDATED_CLASS_SOURCE,
            },
            TEST_CONFIG.transport
        );

        expect(updateErr).toBeNull();
        console.log(`Updated ABAP class: ${TEST_NAME}`);
    });

    it('should read the updated ABAP class source', async () => {
        if (shouldSkip(client) || !objectCreated) {
            console.log('Skipping - no session or class not created');
            return;
        }

        const [objects, readErr] = await client!.read([
            { name: TEST_NAME, extension: 'aclass' }
        ]);

        expect(readErr).toBeNull();
        expect(objects).toHaveLength(1);
        expect(objects![0]!.content).toContain('Updated test method with changes');
        console.log(`Verified updated class source contains changes`);
    });

    it('should delete the ABAP class', async () => {
        if (shouldSkip(client) || !objectCreated) {
            console.log('Skipping - no session or class not created');
            return;
        }

        const [, deleteErr] = await client!.delete(
            [{ name: TEST_NAME, extension: 'aclass' }],
            TEST_CONFIG.transport
        );

        expect(deleteErr).toBeNull();
        objectCreated = false;
        console.log(`Deleted ABAP class: ${TEST_NAME}`);
    });
});
