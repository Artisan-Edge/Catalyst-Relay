/**
 * Quick CLI test for tree queries
 * Usage: bun run test-tree.ts <password> [package] [path]
 */

import { createClient } from './src/core';

async function main() {
    const password = process.argv[2];
    if (!password) {
        console.error('Usage: bun run test-tree.ts <password> [package] [path]');
        console.error('  package defaults to ZSNAP_F01');
        console.error('  path is optional for drilling into folders');
        process.exit(1);
    }

    const testPackage = process.argv[3] || 'ZSNAP_F01';
    const testPath = process.argv[4];

    const url = process.env['SAP_TEST_ADT_URL'];
    const client = process.env['SAP_TEST_CLIENT'];
    const username = process.env['SAP_TEST_USERNAME'];

    if (!url || !client || !username) {
        console.error('Missing env vars: SAP_TEST_ADT_URL, SAP_TEST_CLIENT, SAP_TEST_USERNAME');
        process.exit(1);
    }

    console.log(`Connecting to ${url} as ${username}...`);

    const [adtClient, createErr] = await createClient({
        url,
        client,
        auth: {
            type: 'basic',
            username,
            password,
        },
    });

    if (createErr) {
        console.error('Failed to create client:', createErr.message);
        process.exit(1);
    }

    const [loginResult, loginErr] = await adtClient.login();
    if (loginErr) {
        console.error('Login failed:', loginErr.message);
        process.exit(1);
    }
    console.log(`Logged in as ${loginResult.username}\n`);

    // Test 1: Top level
    console.log('='.repeat(60));
    console.log(`TEST 1: Top level of ${testPackage}`);
    console.log('='.repeat(60));
    await testTree(adtClient, testPackage);

    // Test 2: Drill into first folder if exists and no path specified
    if (!testPath) {
        const [topLevel] = await adtClient.getTree({ package: testPackage });
        if (topLevel && topLevel.folders.length > 0) {
            const firstFolder = topLevel.folders[0]!;
            console.log('\n' + '='.repeat(60));
            console.log(`TEST 2: Inside folder "${firstFolder.name}"`);
            console.log('='.repeat(60));
            await testTree(adtClient, testPackage, firstFolder.name);

            // Test 3: Drill deeper if there are more folders
            const [level2] = await adtClient.getTree({ package: testPackage, path: firstFolder.name });
            if (level2 && level2.folders.length > 0) {
                const secondFolder = level2.folders[0]!;
                const deepPath = `${firstFolder.name}/${secondFolder.name}`;
                console.log('\n' + '='.repeat(60));
                console.log(`TEST 3: Inside folder "${deepPath}"`);
                console.log('='.repeat(60));
                await testTree(adtClient, testPackage, deepPath);
            }
        }
    } else {
        // User specified a path
        console.log('\n' + '='.repeat(60));
        console.log(`TEST 2: With path "${testPath}"`);
        console.log('='.repeat(60));
        await testTree(adtClient, testPackage, testPath);
    }

    await adtClient.logout();
    console.log('\nDone.');
}

async function testTree(client: any, pkg: string, path?: string) {
    const query = path ? { package: pkg, path } : { package: pkg };
    console.log(`Query: ${JSON.stringify(query)}\n`);

    const [tree, treeErr] = await client.getTree(query);
    if (treeErr) {
        console.error('Tree query failed:', treeErr.message);
        return;
    }

    // Display packages
    if (tree.packages.length > 0) {
        console.log(`Packages (${tree.packages.length}):`);
        for (const pkg of tree.packages) {
            const desc = pkg.description ? ` - ${pkg.description}` : '';
            console.log(`  ${pkg.name} (${pkg.numContents})${desc}`);
        }
        console.log();
    }

    // Display folders
    if (tree.folders.length > 0) {
        console.log(`Folders (${tree.folders.length}):`);
        for (const folder of tree.folders) {
            const nameDisplay = folder.displayName !== folder.name
                ? `${folder.displayName} [${folder.name}]`
                : folder.name;
            console.log(`  ${nameDisplay} (${folder.numContents})`);
        }
        console.log();
    }

    // Display objects
    if (tree.objects.length > 0) {
        console.log(`Objects (${tree.objects.length}):`);
        const sample = tree.objects.slice(0, 10);
        for (const obj of sample) {
            console.log(`  ${obj.name} [${obj.objectType}]`);
        }
        if (tree.objects.length > 10) {
            console.log(`  ... and ${tree.objects.length - 10} more`);
        }
        console.log();
    }

    // Summary
    const total = tree.packages.length + tree.folders.length + tree.objects.length;
    if (total === 0) {
        console.log('(empty)');
    } else {
        console.log(`Total: ${tree.packages.length} packages, ${tree.folders.length} folders, ${tree.objects.length} objects`);
    }
}

main().catch(console.error);
