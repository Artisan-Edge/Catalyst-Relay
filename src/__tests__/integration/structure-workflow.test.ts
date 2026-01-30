/**
 * Integration Test: Structure Workflow
 *
 * Tests reading existing SAP structures to verify structure type support.
 *
 * Uses the standard SAP structure RBDRSEG_DT (Batch IV: Invoice Document Items - Data Part)
 * which exists in all SAP systems.
 *
 * Requires environment variables:
 * - SAP_TEST_USERNAME: SAP username
 * - SAP_PASSWORD: SAP password
 *
 * Run with: bun test src/__tests__/integration/structure-workflow.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
    createTestClient,
    shouldSkip,
    safeLogout,
} from './test-helpers';
import type { ADTClient } from '../../core';

// Standard SAP structure that exists in all systems
const STRUCTURE_NAME = 'RBDRSEG_DT';

describe('Structure Workflow', () => {
    let client: ADTClient | null = null;

    beforeAll(async () => {
        const [newClient, err] = await createTestClient();
        if (err) throw err;
        client = newClient;
    });

    afterAll(async () => {
        await safeLogout(client);
    });

    it('should read an existing structure definition', async () => {
        if (shouldSkip(client)) return;

        const [objects, readErr] = await client!.read([
            { name: STRUCTURE_NAME, extension: 'astablds' }
        ]);

        expect(readErr).toBeNull();
        expect(objects).toHaveLength(1);

        const structure = objects![0]!;
        expect(structure.name.toUpperCase()).toBe(STRUCTURE_NAME);
        expect(structure.extension).toBe('astablds');
        expect(structure.content).toContain('define structure');
        expect(structure.content.toLowerCase()).toContain('rbdrseg_dt');

        console.log(`Read structure: ${structure.name}`);
        console.log(`Content preview:\n${structure.content.substring(0, 500)}...`);
    });

    it('should contain expected structure fields', async () => {
        if (shouldSkip(client)) return;

        const [objects, readErr] = await client!.read([
            { name: STRUCTURE_NAME, extension: 'astablds' }
        ]);

        expect(readErr).toBeNull();
        const content = objects![0]!.content;

        // Verify structure contains expected fields from the example
        expect(content).toContain('bpmng');
        expect(content).toContain('bprme');

        // Verify annotations are present
        expect(content).toContain('@EndUserText.label');
        expect(content).toContain('@AbapCatalog.enhancement.category');

        console.log('Structure contains expected fields and annotations');
    });
});
