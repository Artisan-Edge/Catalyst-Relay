/**
 * Integration Test: Syntax Check Error Detection
 *
 * Creates objects with intentional errors and verifies that
 * checkSyntax returns error/warning messages with line/column info.
 *
 * The checkSyntax function reads source from SAP, then sends it inline
 * (base64) for checking — catching both syntax errors and ATC warnings.
 *
 * Run with: bun test src/__tests__/integration/syntax-check-errors-workflow.test.ts
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

// ─────────────────────────────────────────────────────────────────────────────
// Test objects with intentional errors
// ─────────────────────────────────────────────────────────────────────────────

const PROG_NAME = generateTestName('ZSNAP_CHKP');

// ABAP program with an undeclared variable (syntax error)
const BAD_PROGRAM = `REPORT ${PROG_NAME}.
DATA lv_value TYPE string.
lv_value = 'hello'.
lv_undefined = 'this variable was never declared'.`;

describe('Syntax Check Error Detection', () => {
    let client: ADTClient | null = null;
    let progCreated = false;

    beforeAll(async () => {
        const [newClient, err] = await createTestClient();
        if (err) throw err;
        client = newClient;
    });

    afterAll(async () => {
        if (!client?.session) return;
        if (progCreated) {
            await safeDelete(client, [{ name: PROG_NAME, extension: 'asprog' }], TEST_CONFIG.transport);
        }
        await safeLogout(client);
    });

    it('should create ABAP program with syntax error', async () => {
        if (shouldSkip(client)) return;

        const [, createErr] = await client!.create(
            {
                name: PROG_NAME,
                extension: 'asprog',
                content: BAD_PROGRAM,
                description: 'Test program with syntax errors',
            },
            TEST_CONFIG.package,
            TEST_CONFIG.transport
        );

        expect(createErr).toBeNull();
        progCreated = true;
        console.log(`Created ABAP program: ${PROG_NAME}`);
    });

    it('should detect syntax errors via check', async () => {
        if (shouldSkip(client) || !progCreated) return;

        const [results, checkErr] = await client!.checkSyntax([
            { name: PROG_NAME, extension: 'asprog' }
        ]);

        expect(checkErr).toBeNull();
        expect(results).toHaveLength(1);

        const result = results![0]!;
        console.log(`Status: ${result.status}`);
        console.log(`Messages (${result.messages.length}):`);
        for (const msg of result.messages) {
            console.log(`  [${msg.severity}] ${msg.text} (line ${msg.line}, col ${msg.column})`);
        }

        // Undeclared variable should trigger at least one error
        expect(result.messages.length).toBeGreaterThan(0);
        expect(result.status).not.toBe('success');
    }, 15000);

    it('should delete the ABAP program', async () => {
        if (shouldSkip(client) || !progCreated) return;

        const [, deleteErr] = await client!.delete(
            [{ name: PROG_NAME, extension: 'asprog' }],
            TEST_CONFIG.transport
        );

        expect(deleteErr).toBeNull();
        progCreated = false;
        console.log(`Deleted ABAP program: ${PROG_NAME}`);
    });
});
