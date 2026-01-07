/**
 * Integration Test: Discovery Workflow
 *
 * Tests discovery operations (read-only):
 * - getPackages: List available packages
 * - getTree: Get hierarchical package structure
 * - getTransports: List transports for a package
 *
 * Requires environment variables:
 * - SAP_TEST_USERNAME: SAP username
 * - SAP_PASSWORD: SAP password
 *
 * Run with: bun test src/__tests__/integration/discovery-workflow.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createTestClient, shouldSkip, safeLogout, TEST_CONFIG } from './test-helpers';
import type { ADTClient } from '../../core';

describe('Discovery Workflow', () => {
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

    it('should get packages list with filter', async () => {
        if (shouldSkip(client)) return;

        // Use 'Z*' filter to get only custom packages (faster than '*' which returns all)
        const [packages, err] = await client!.getPackages('Z*');

        expect(err).toBeNull();
        expect(packages).toBeDefined();
        expect(Array.isArray(packages)).toBe(true);

        console.log(`Found ${packages!.length} packages matching 'Z*'`);
        // Show first few packages
        const sample = packages!.slice(0, 5);
        console.log('Sample packages:');
        sample.forEach(pkg => {
            console.log(`  - ${pkg.name}: ${pkg.description || '(no description)'}`);
        });
    });

    it('should return only packages matching the Z* filter', async () => {
        if (shouldSkip(client)) return;

        const [packages, err] = await client!.getPackages('Z*');

        expect(err).toBeNull();
        expect(packages).toBeDefined();

        // Identify packages that don't match the filter
        const nonMatchingPackages = packages!.filter(
            pkg => !pkg.name.toUpperCase().startsWith('Z')
        );

        // Log non-matching packages for debugging
        if (nonMatchingPackages.length > 0) {
            console.log(`WARNING: Found ${nonMatchingPackages.length} packages NOT matching 'Z*' filter:`);
            nonMatchingPackages.forEach(pkg => {
                console.log(`  - ${pkg.name}: ${pkg.description || '(no description)'}`);
            });
        }

        // Verify all packages match the filter
        expect(nonMatchingPackages).toEqual([]);
    });

    it('should get tree for $TMP package', async () => {
        if (shouldSkip(client)) return;

        const [tree, err] = await client!.getTree({ package: '$TMP' });

        expect(err).toBeNull();
        expect(tree).toBeDefined();
        expect(Array.isArray(tree)).toBe(true);

        console.log(`Tree has ${tree!.length} root nodes`);
        if (tree!.length > 0) {
            console.log('Sample tree nodes:');
            tree!.slice(0, 3).forEach(node => {
                console.log(`  - ${node.name} (${node.type})`);
            });
        }
    });

    it('should get transports for a package', async () => {
        if (shouldSkip(client)) return;

        const [transports, err] = await client!.getTransports(TEST_CONFIG.package);

        expect(err).toBeNull();
        expect(transports).toBeDefined();
        expect(Array.isArray(transports)).toBe(true);

        console.log(`Found ${transports!.length} transports for package ${TEST_CONFIG.package}`);
        if (transports!.length > 0) {
            console.log('Sample transports:');
            transports!.slice(0, 5).forEach(transport => {
                console.log(`  - ${transport.id}: ${transport.description || '(no description)'}`);
            });
        }
    });
});
