/**
 * Test the nodestructure endpoint for package hierarchy
 * Usage: bun run test-nodestructure.ts <password> [package]
 */

import { createClient } from './src/core';

async function main() {
    const password = process.argv[2];
    if (!password) {
        console.error('Usage: bun run test-nodestructure.ts <password> [package]');
        process.exit(1);
    }

    const testPackage = process.argv[3] || 'ZSNAP_F01';

    const url = process.env['SAP_TEST_ADT_URL'];
    const sapClient = process.env['SAP_TEST_CLIENT'];
    const username = process.env['SAP_TEST_USERNAME'];

    if (!url || !sapClient || !username) {
        console.error('Missing env vars: SAP_TEST_ADT_URL, SAP_TEST_CLIENT, SAP_TEST_USERNAME');
        process.exit(1);
    }

    console.log(`Connecting to ${url} as ${username}...`);

    const [adtClient, createErr] = await createClient({
        url,
        client: sapClient,
        auth: { type: 'basic', username, password },
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

    // Use the client's internal request method via a workaround
    // We'll access the private requestor through the prototype
    const client = adtClient as any;
    const requestor = client.requestor;

    if (!requestor) {
        console.error('Could not access requestor');
        process.exit(1);
    }

    // Build nodestructure request
    const params = new URLSearchParams([
        ['parent_type', 'DEVC/K'],
        ['parent_name', testPackage],
        ['withShortDescriptions', 'true'],
    ]);

    const endpoint = `/sap/bc/adt/repository/nodestructure?${params.toString()}`;
    console.log(`Requesting: ${endpoint}\n`);

    const [response, reqErr] = await requestor.request({
        method: 'POST',
        path: endpoint,
        headers: {
            'Accept': 'application/vnd.sap.as+xml',
        },
    });

    if (reqErr) {
        console.error('Request error:', reqErr.message);
        process.exit(1);
    }

    console.log(`Status: ${response.status} ${response.statusText}\n`);

    const text = await response.text();
    console.log('=== RAW RESPONSE ===');
    // Pretty print XML
    const formatted = text
        .replace(/></g, '>\n<')
        .replace(/(<[^/][^>]*>)([^<]+)(<\/)/g, '$1\n  $2\n$3')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');
    console.log(formatted);
    console.log('====================\n');

    // Try to parse and show structure
    if (response.ok && text.includes('<')) {
        // Count some elements
        const nodeMatches = text.match(/<[^:]*:?NODE/gi);
        const categoryMatches = text.match(/<[^:]*:?CATEGORY/gi);

        console.log('Summary:');
        console.log(`  NODE elements: ${nodeMatches?.length || 0}`);
        console.log(`  CATEGORY elements: ${categoryMatches?.length || 0}`);

        // Look for DEVC (package) nodes
        const devcMatches = text.match(/OBJECT_TYPE="DEVC\/K"[^>]*OBJECT_NAME="([^"]+)"/g);
        if (devcMatches && devcMatches.length > 0) {
            console.log(`\nPackages found:`);
            devcMatches.forEach(m => {
                const name = m.match(/OBJECT_NAME="([^"]+)"/)?.[1];
                console.log(`  - ${name}`);
            });
        }
    }

    await adtClient.logout();
}

main().catch(console.error);
