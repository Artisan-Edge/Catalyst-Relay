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
        await safeLogout(client);
    });

    it('should get packages list with filter', async () => {
        if (shouldSkip(client)) return;

        const [packages, err] = await client!.getPackages('Z*');

        expect(err).toBeNull();
        expect(packages).toBeDefined();
        expect(Array.isArray(packages)).toBe(true);

        console.log(`Found ${packages!.length} packages matching 'Z*'`);
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

        const nonMatchingPackages = packages!.filter(
            pkg => !pkg.name.toUpperCase().startsWith('Z')
        );

        if (nonMatchingPackages.length > 0) {
            console.log(`WARNING: Found ${nonMatchingPackages.length} packages NOT matching 'Z*' filter:`);
            nonMatchingPackages.forEach(pkg => {
                console.log(`  - ${pkg.name}: ${pkg.description || '(no description)'}`);
            });
        }

        expect(nonMatchingPackages).toEqual([]);
    });

    it('should get top-level packages when no package specified', async () => {
        if (shouldSkip(client)) return;

        const [tree, err] = await client!.getTree({});

        expect(err).toBeNull();
        expect(tree).toBeDefined();
        expect(tree!.packages).toBeDefined();
        expect(tree!.folders).toEqual([]);
        expect(tree!.objects).toEqual([]);

        console.log(`Found ${tree!.packages.length} top-level packages`);
        if (tree!.packages.length > 0) {
            console.log('Sample top-level packages:');
            tree!.packages.slice(0, 10).forEach(pkg => {
                console.log(`  - ${pkg.name}: ${pkg.description || '(no description)'}`);
            });
        }

        // Verify these are truly top-level (no parent)
        expect(tree!.packages.length).toBeGreaterThan(0);
    });

    it('should include BASIS package with correct metadata', async () => {
        if (shouldSkip(client)) return;

        const [tree, err] = await client!.getTree({});

        expect(err).toBeNull();
        expect(tree).toBeDefined();

        // Find the BASIS package
        const basisPackage = tree!.packages.find(pkg => pkg.name === 'BASIS');

        // Verify BASIS package exists
        expect(basisPackage).toBeDefined();
        if (!basisPackage) return;

        console.log(`BASIS package: ${basisPackage.name}`);
        console.log(`  Description: ${basisPackage.description}`);
        console.log(`  numContents: ${basisPackage.numContents}`);

        // Verify description
        expect(basisPackage.description).toBe('BASIS Structure Package');

        // Verify numContents is substantial (BASIS is a core SAP package)
        expect(basisPackage.numContents).toBeGreaterThan(100000);
    });

    it('should return BASIS subpackages with descriptions and counts', async () => {
        if (shouldSkip(client)) return;

        const [tree, err] = await client!.getTree({ package: 'BASIS' });

        expect(err).toBeNull();
        expect(tree).toBeDefined();
        expect(tree!.packages.length).toBeGreaterThan(0);

        console.log(`BASIS has ${tree!.packages.length} child packages`);
        console.log('Sample child packages:');
        tree!.packages.slice(0, 10).forEach(pkg => {
            console.log(`  - ${pkg.name} (${pkg.numContents}): ${pkg.description || '(no description)'}`);
        });

        // Verify known subpackages have correct metadata
        const aifStruc = tree!.packages.find(p => p.name === '/AIF/STRUC');
        if (aifStruc) {
            expect(aifStruc.description).toBe('SAP Application Interface Framework - Structure Package');
            expect(aifStruc.numContents).toBeGreaterThan(7000);
            console.log(`  /AIF/STRUC verified: ${aifStruc.numContents} items`);
        }

        const clmdv = tree!.packages.find(p => p.name === '/CLMDV/DV');
        if (clmdv) {
            expect(clmdv.description).toBe('Main Package for Data Validation Framework');
            expect(clmdv.numContents).toBeGreaterThan(700);
            console.log(`  /CLMDV/DV verified: ${clmdv.numContents} items`);
        }

        // Verify at least some packages have non-zero counts and descriptions
        const packagesWithCounts = tree!.packages.filter(p => p.numContents > 0);
        const packagesWithDescriptions = tree!.packages.filter(p => p.description && p.description.length > 0);

        console.log(`Packages with counts > 0: ${packagesWithCounts.length}/${tree!.packages.length}`);
        console.log(`Packages with descriptions: ${packagesWithDescriptions.length}/${tree!.packages.length}`);

        // Most packages should have counts and descriptions
        expect(packagesWithCounts.length).toBeGreaterThan(tree!.packages.length * 0.5);
        expect(packagesWithDescriptions.length).toBeGreaterThan(tree!.packages.length * 0.5);
    });

    it('should get BASIS package stats via getPackageStats', async () => {
        if (shouldSkip(client)) return;

        const [stats, err] = await client!.getPackageStats('BASIS');

        expect(err).toBeNull();
        expect(stats).toBeDefined();

        console.log(`getPackageStats('BASIS'):`);
        console.log(`  name: ${stats!.name}`);
        console.log(`  description: ${stats!.description}`);
        console.log(`  numContents: ${stats!.numContents}`);

        // Verify the stats match what we'd get from getTree
        expect(stats!.name).toBe('BASIS');
        expect(stats!.description).toBe('BASIS Structure Package');
        expect(stats!.numContents).toBeGreaterThan(100000);
    });

    it('should get FINS_FIS_FICO package stats via getPackageStats (nested package)', async () => {
        if (shouldSkip(client)) return;

        const [stats, err] = await client!.getPackageStats('FINS_FIS_FICO');

        expect(err).toBeNull();
        expect(stats).toBeDefined();

        console.log(`getPackageStats('FINS_FIS_FICO'):`);
        console.log(`  name: ${stats!.name}`);
        console.log(`  description: ${stats!.description}`);
        console.log(`  numContents: ${stats!.numContents}`);

        // FINS_FIS_FICO is a nested package under SAP_FIN
        expect(stats!.name).toBe('FINS_FIS_FICO');
        expect(stats!.description).toBe('Financials Information System: FICO (SAP_FIN)');
        expect(stats!.numContents).toBeGreaterThan(6000);
    });

    it('should get tree for $TMP package', async () => {
        if (shouldSkip(client)) return;

        const [tree, err] = await client!.getTree({ package: '$TMP' });

        expect(err).toBeNull();
        expect(tree).toBeDefined();
        expect(tree!.packages).toBeDefined();
        expect(tree!.folders).toBeDefined();
        expect(tree!.objects).toBeDefined();

        const totalNodes = tree!.packages.length + tree!.folders.length + tree!.objects.length;
        console.log(`Tree has ${totalNodes} items (${tree!.packages.length} packages, ${tree!.folders.length} folders, ${tree!.objects.length} objects)`);

        if (tree!.packages.length > 0) {
            console.log('Sample packages:');
            tree!.packages.slice(0, 3).forEach(pkg => {
                console.log(`  - ${pkg.name} (${pkg.numContents} items)`);
            });
        }
        if (tree!.folders.length > 0) {
            console.log('Sample folders:');
            tree!.folders.slice(0, 3).forEach(folder => {
                console.log(`  - ${folder.name} (${folder.numContents} items)`);
            });
        }
    });

    it('should not return the queried package in its own tree results', async () => {
        if (shouldSkip(client)) return;

        const testPackage = TEST_CONFIG.package;
        const [tree, err] = await client!.getTree({ package: testPackage });

        expect(err).toBeNull();
        expect(tree).toBeDefined();

        console.log(`Contents of package ${testPackage}:`);
        console.log(`  Packages: ${tree!.packages.map(p => p.name).join(', ') || '(none)'}`);
        console.log(`  Folders: ${tree!.folders.map(f => f.name).join(', ') || '(none)'}`);
        console.log(`  Objects: ${tree!.objects.length} items`);

        // Check if the queried package appears in its own packages list
        const selfReferences = tree!.packages.filter(pkg => pkg.name === testPackage);

        if (selfReferences.length > 0) {
            console.error(`ERROR: Package ${testPackage} contains itself in tree results`);
        }

        expect(selfReferences).toEqual([]);
    });

    it('should support path navigation into folders', async () => {
        if (shouldSkip(client)) return;

        // First get the top level of ZSNAP_F01
        const [topLevel, topErr] = await client!.getTree({ package: 'ZSNAP_F01' });
        expect(topErr).toBeNull();
        expect(topLevel).toBeDefined();

        console.log('ZSNAP_F01 top level:');
        console.log(`  Packages: ${topLevel!.packages.map(p => `${p.name}(${p.numContents})`).join(', ')}`);
        console.log(`  Folders: ${topLevel!.folders.map(f => `${f.name}(${f.numContents})`).join(', ')}`);

        // If there's a folder, try to navigate into it
        if (topLevel!.folders.length > 0) {
            const firstFolder = topLevel!.folders[0]!;
            const [nested, nestedErr] = await client!.getTree({
                package: 'ZSNAP_F01',
                path: firstFolder.name,
            });

            expect(nestedErr).toBeNull();
            expect(nested).toBeDefined();

            console.log(`\nInside ${firstFolder.name}:`);
            console.log(`  Folders: ${nested!.folders.map(f => `${f.name}(${f.numContents})`).join(', ') || '(none)'}`);
            console.log(`  Objects: ${nested!.objects.length} items`);
        }
    });

    it('should traverse FINS_FIS_FICO package folders to find I_JournalEntry', async () => {
        if (shouldSkip(client)) return;

        // Step 1: Get FINS_FIS_FICO package top level
        const [topLevel, topErr] = await client!.getTree({ package: 'FINS_FIS_FICO' });
        expect(topErr).toBeNull();
        expect(topLevel).toBeDefined();

        console.log('FINS_FIS_FICO top level:');
        console.log(`  Folders: ${topLevel!.folders.map(f => `${f.name}(${f.numContents})`).join(', ')}`);

        // Find CORE_DATA_SERVICES folder
        const cdsFolder = topLevel!.folders.find(f => f.name === 'CORE_DATA_SERVICES');
        expect(cdsFolder).toBeDefined();
        expect(cdsFolder!.numContents).toBeGreaterThan(1000);
        console.log(`  CORE_DATA_SERVICES has ${cdsFolder!.numContents} items`);

        // Step 2: Navigate into CORE_DATA_SERVICES
        const [cdsLevel, cdsErr] = await client!.getTree({
            package: 'FINS_FIS_FICO',
            path: 'CORE_DATA_SERVICES',
        });
        expect(cdsErr).toBeNull();
        expect(cdsLevel).toBeDefined();

        console.log('\nInside CORE_DATA_SERVICES:');
        console.log(`  Folders: ${cdsLevel!.folders.map(f => `${f.name}(${f.numContents})`).join(', ')}`);

        // Find DDLS (Data Definitions) folder
        const ddlsFolder = cdsLevel!.folders.find(f => f.name === 'DDLS');
        expect(ddlsFolder).toBeDefined();
        expect(ddlsFolder!.numContents).toBeGreaterThan(800);
        console.log(`  DDLS (Data Definitions) has ${ddlsFolder!.numContents} items`);

        // Step 3: Navigate into DDLS to get objects
        const [ddlsLevel, ddlsErr] = await client!.getTree({
            package: 'FINS_FIS_FICO',
            path: 'CORE_DATA_SERVICES/DDLS',
        });
        expect(ddlsErr).toBeNull();
        expect(ddlsLevel).toBeDefined();

        console.log('\nInside CORE_DATA_SERVICES/DDLS:');
        console.log(`  Objects: ${ddlsLevel!.objects.length} items`);

        // Print sample object names for debugging
        const sampleObjects = ddlsLevel!.objects.slice(0, 20).map(o => o.name);
        console.log(`  Sample objects: ${sampleObjects.join(', ')}`);

        // Check if any I_JOURNAL* objects exist (names are uppercase)
        const journalObjects = ddlsLevel!.objects.filter(obj => obj.name.startsWith('I_JOURNAL'));
        console.log(`  I_JOURNAL* objects found: ${journalObjects.length}`);
        if (journalObjects.length > 0) {
            console.log(`    ${journalObjects.map(o => o.name).join(', ')}`);
        }

        // Verify we got a substantial number of objects (the folder should have 800+)
        expect(ddlsLevel!.objects.length).toBeGreaterThan(800);

        // Verify I_JOURNALENTRY exists (SAP returns uppercase names)
        const journalEntry = ddlsLevel!.objects.find(obj => obj.name === 'I_JOURNALENTRY');
        if (journalEntry) {
            console.log(`  Found I_JOURNALENTRY: ${journalEntry.objectType} (${journalEntry.extension})`);
        } else {
            console.log('  WARNING: I_JOURNALENTRY not found in this package');
        }
        expect(journalEntry).toBeDefined();
    }, 30000); // Increase timeout to 30 seconds

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

        if (TEST_CONFIG.transport) {
            const expectedTransport = TEST_CONFIG.transport;
            const found = transports!.some(t => t.id === expectedTransport);
            expect(found).toBe(true);
            if (!found) {
                console.error(`Expected transport ${expectedTransport} not found in results`);
                console.error('Available transports:', transports!.map(t => t.id));
            }
        } else {
            expect(transports!.length).toBeGreaterThan(0);
        }
    });
});
