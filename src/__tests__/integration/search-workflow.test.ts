/**
 * Integration Test: Search Workflow
 *
 * Tests search operations (read-only):
 * - search: Search for objects by pattern
 * - search with type filter: Search with specific object types
 * - whereUsed: Find dependencies for an object
 *
 * Requires environment variables:
 * - SAP_TEST_USERNAME: SAP username
 * - SAP_PASSWORD: SAP password
 *
 * Run with: bun test src/__tests__/integration/search-workflow.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createTestClient, shouldSkip, safeLogout } from './test-helpers';
import type { ADTClient } from '../../core';

describe('Search Workflow', () => {
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

    it('should search for objects starting with Z', async () => {
        if (shouldSkip(client)) return;

        const [results, err] = await client!.search('Z*');

        expect(err).toBeNull();
        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);

        console.log(`Found ${results!.length} objects matching 'Z*'`);
        if (results!.length > 0) {
            console.log('Sample results:');
            results!.slice(0, 5).forEach(result => {
                console.log(`  - ${result.name} (${result.objectType}): ${result.description || '(no description)'}`);
            });
        }
    });

    it('should search with type filter', async () => {
        if (shouldSkip(client)) return;

        const [results, err] = await client!.search('Z*', ['DDLS/DF']);

        expect(err).toBeNull();
        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);

        console.log(`Found ${results!.length} CDS views matching 'Z*'`);
        if (results!.length > 0) {
            console.log('Sample CDS views:');
            results!.slice(0, 5).forEach(result => {
                console.log(`  - ${result.name}: ${result.description || '(no description)'}`);
                expect(result.objectType).toBe('DDLS/DF');
            });
        }
    });

    it('should find where T000 is used', async () => {
        if (shouldSkip(client)) return;

        // T000 is a standard SAP table (client table) that should have dependencies
        const [dependencies, err] = await client!.whereUsed({
            name: 'T000',
            extension: 'astabldt'
        });

        expect(err).toBeNull();
        expect(dependencies).toBeDefined();
        expect(Array.isArray(dependencies)).toBe(true);

        console.log(`T000 is used in ${dependencies!.length} places`);
        if (dependencies!.length > 0) {
            console.log('Sample dependencies:');
            dependencies!.slice(0, 5).forEach(dep => {
                console.log(`  - ${dep.name} (${dep.usageType}) in ${dep.package}`);
            });
        }
    });
});
