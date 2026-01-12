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
                expect(result.objectType).toBe('View');
            });
        }
    });

    it('should refresh session and continue working', async () => {
        if (shouldSkip(client)) return;

        // First search
        const [results1, err1] = await client!.search('MARA');
        expect(err1).toBeNull();
        expect(results1).toBeDefined();
        console.log(`First search found ${results1!.length} objects`);

        // Refresh session via reentrance ticket
        console.log('Refreshing session...');
        const [refreshResult, refreshErr] = await client!.refreshSession();
        expect(refreshErr).toBeNull();
        expect(refreshResult).toBeDefined();
        expect(refreshResult!.ticket).toBeDefined();
        expect(refreshResult!.expiresAt).toBeGreaterThan(Date.now());
        console.log(`Session refreshed, new expiration: ${new Date(refreshResult!.expiresAt).toISOString()}`);
        console.log(`Received ticket: ${refreshResult!.ticket.substring(0, 30)}...`);

        // Second search after refresh - should still work
        const [results2, err2] = await client!.search('VBAK');
        expect(err2).toBeNull();
        expect(results2).toBeDefined();
        console.log(`Second search (after refresh) found ${results2!.length} objects`);
    });

    it('should find where P_APJrnlEntrItmAgingGrid4 is used', async () => {
        if (shouldSkip(client)) return;

        // Use a CDS view with limited usages to avoid timeout (T000 has too many references)
        const [dependencies, err] = await client!.whereUsed({
            name: 'P_APJrnlEntrItmAgingGrid4',
            extension: 'asddls'
        });

        expect(err).toBeNull();
        expect(dependencies).toBeDefined();
        expect(Array.isArray(dependencies)).toBe(true);

        console.log(`P_APJrnlEntrItmAgingGrid4 is used in ${dependencies!.length} places`);
        if (dependencies!.length > 0) {
            console.log('Sample dependencies:');
            dependencies!.slice(0, 5).forEach(dep => {
                console.log(`  - ${dep.name} (${dep.usageType}) in ${dep.package}`);
            });
        }
    });
});
