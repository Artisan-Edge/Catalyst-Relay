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

    it('should not return the queried package in its own tree results', async () => {
        if (shouldSkip(client)) return;

        // Test with configured package
        const testPackage = TEST_CONFIG.package;
        const [tree, err] = await client!.getTree({ package: testPackage });

        expect(err).toBeNull();
        expect(tree).toBeDefined();

        // Find any nodes that match the queried package name
        const selfReferences = tree!.filter(node => node.name === testPackage);

        if (selfReferences.length > 0) {
            console.error(`ERROR: Package ${testPackage} contains itself in tree results:`);
            selfReferences.forEach(node => {
                console.error(`  - ${node.name} (${node.type})`);
            });
        }

        // Package should NOT appear in its own tree contents
        expect(selfReferences).toEqual([]);
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
                console.log(`  - ${transport.id}: ${transport.description || '(no description)'} (owner: ${transport.owner})`);
            });
        }

        // Verify the expected test transport is present
        if (TEST_CONFIG.transport) {
            const expectedTransport = TEST_CONFIG.transport;
            const found = transports!.some(t => t.id === expectedTransport);
            expect(found).toBe(true);
            if (!found) {
                console.error(`Expected transport ${expectedTransport} not found in results`);
                console.error('Available transports:', transports!.map(t => t.id));
            }
        } else {
            // If no transport configured, at least expect some transports exist
            expect(transports!.length).toBeGreaterThan(0);
        }
    });
});
