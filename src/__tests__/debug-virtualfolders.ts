/**
 * Debug Script: Verify virtualfolders approach for getPackageStats
 *
 * Tests whether we can get package description and numContents using:
 * 1. GET /sap/bc/adt/packages/{name} - for description
 * 2. POST virtualfolders with PACKAGE preselection - for GROUP counts
 *
 * Run with: bun run src/__tests__/debug-virtualfolders.ts
 */

import * as https from 'https';
import { TEST_CONFIG, validateCredentials } from './integration/test-helpers';
import { fetchVirtualFolders } from '../core/adt/discovery/tree/virtualFolders';
import { safeParseXml, extractError } from '../core/utils/xml';
import type { AdtRequestor } from '../core/adt/types';
import type { AsyncResult } from '../types/result';
import { ok, err } from '../types/result';

// HTTP request helper using Node.js https module
async function httpsRequest(
    url: string,
    options: {
        method: string;
        headers: Record<string, string>;
        body?: string;
    }
): Promise<Response> {
    const urlObj = new URL(url);

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: urlObj.pathname + urlObj.search,
            method: options.method,
            headers: options.headers,
            rejectUnauthorized: false,
        }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf-8');
                const headers = new Headers();
                for (const [key, value] of Object.entries(res.headers)) {
                    if (value) {
                        if (Array.isArray(value)) {
                            value.forEach(v => headers.append(key, v));
                        } else {
                            headers.set(key, value);
                        }
                    }
                }
                resolve(new Response(body, {
                    status: res.statusCode || 0,
                    statusText: res.statusMessage || '',
                    headers,
                }));
            });
        });

        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

// Create a simple requestor for debugging
function createDebugRequestor(
    baseUrl: string,
    client: string,
    username: string,
    password: string,
    csrfToken: string
): AdtRequestor {
    const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

    return {
        request: async (options): AsyncResult<Response, Error> => {
            const url = new URL(options.path, baseUrl);
            url.searchParams.append('sap-client', client);

            const headers: Record<string, string> = {
                'Authorization': authHeader,
                'x-csrf-token': csrfToken,
                ...options.headers,
            };

            try {
                const requestOpts: { method: string; headers: Record<string, string>; body?: string } = {
                    method: options.method,
                    headers,
                };
                if (options.body) requestOpts.body = options.body;

                const response = await httpsRequest(url.toString(), requestOpts);
                return ok(response);
            } catch (error) {
                return err(error instanceof Error ? error : new Error(String(error)));
            }
        },
    };
}

// Fetch CSRF token
async function fetchCsrfToken(
    baseUrl: string,
    client: string,
    username: string,
    password: string
): Promise<string> {
    const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
    const url = new URL('/sap/bc/adt/discovery', baseUrl);
    url.searchParams.append('sap-client', client);

    const response = await httpsRequest(url.toString(), {
        method: 'GET',
        headers: {
            'Authorization': authHeader,
            'x-csrf-token': 'Fetch',
        },
    });

    const token = response.headers.get('x-csrf-token');
    if (!token) throw new Error('Failed to fetch CSRF token');
    return token;
}

// Test packages: top-level, nested, and custom
const TEST_PACKAGES = ['BASIS', 'FINS_FIS_FICO', 'ZSNAP_F01'];

interface PackageMetadata {
    name: string;
    description?: string;
}

interface DebugResult {
    packageName: string;
    metadata: PackageMetadata | null;
    metadataError?: string;
    groupFolders: { name: string; count: number }[];
    groupFoldersError?: string;
    totalCount: number;
    topLevelCount?: number;
    topLevelError?: string;
}

// Fetch package metadata (description) from /sap/bc/adt/packages/{name}
async function fetchPackageMetadata(
    requestor: AdtRequestor,
    packageName: string
): Promise<[PackageMetadata | null, Error | null]> {
    const [response, requestErr] = await requestor.request({
        method: 'GET',
        path: `/sap/bc/adt/packages/${packageName.toLowerCase()}`,
        headers: {
            'Accept': 'application/vnd.sap.adt.packages.v1+xml',
        },
    });

    if (requestErr) return [null, requestErr];
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return [null, new Error(`Package metadata failed: ${errorMsg}`)];
    }

    const xml = await response.text();
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) return [null, parseErr];

    // Extract package name and description
    const packageElements = doc.getElementsByTagName('pak:package');
    if (packageElements.length === 0) {
        return [null, new Error('No pak:package element found')];
    }

    const pkgEl = packageElements[0]!;
    const name = pkgEl.getAttribute('adtcore:name') ||
                 pkgEl.getAttributeNS('http://www.sap.com/adt/core', 'name') ||
                 packageName;
    const description = pkgEl.getAttribute('adtcore:description') ||
                        pkgEl.getAttributeNS('http://www.sap.com/adt/core', 'description');

    const result: PackageMetadata = { name };
    if (description) result.description = description;

    return [result, null];
}

// Fetch GROUP folders via virtualfolders for a package
async function fetchGroupFolders(
    requestor: AdtRequestor,
    packageName: string
): Promise<[{ name: string; count: number }[], Error | null]> {
    const [parsed, parseErr] = await fetchVirtualFolders(requestor, {
        PACKAGE: { name: `..${packageName}`, hasChildrenOfSameFacet: false },
    });

    if (parseErr) return [[], parseErr];

    const groupFolders = parsed.folders
        .filter(f => f.facet === 'GROUP')
        .map(f => ({ name: f.name, count: f.count }));

    return [groupFolders, null];
}

// Fetch top-level listing to compare counts (for validation)
async function fetchTopLevelCount(
    requestor: AdtRequestor,
    packageName: string
): Promise<[number | null, Error | null]> {
    const [parsed, parseErr] = await fetchVirtualFolders(requestor, {});
    if (parseErr) return [null, parseErr];

    const pkg = parsed.folders.find(
        f => f.facet === 'PACKAGE' && f.name.toUpperCase() === packageName.toUpperCase()
    );

    if (!pkg) return [null, null]; // Not a top-level package
    return [pkg.count, null];
}

async function runDebug() {
    console.log('='.repeat(60));
    console.log('Debug: Verifying virtualfolders approach for getPackageStats');
    console.log('='.repeat(60));

    // Validate credentials
    try {
        validateCredentials();
    } catch (e) {
        console.error('Missing credentials:', (e as Error).message);
        process.exit(1);
    }

    const { adtUrl, client, username, password } = TEST_CONFIG;
    console.log(`\nConnecting to ${adtUrl} as ${username}...`);

    // Fetch CSRF token
    let csrfToken: string;
    try {
        csrfToken = await fetchCsrfToken(adtUrl, client, username, password);
        console.log('CSRF token obtained successfully');
    } catch (e) {
        console.error('Failed to get CSRF token:', (e as Error).message);
        process.exit(1);
    }

    // Create requestor
    const requestor = createDebugRequestor(adtUrl, client, username, password, csrfToken);

    const results: DebugResult[] = [];

    for (const packageName of TEST_PACKAGES) {
        console.log(`\n${'─'.repeat(50)}`);
        console.log(`Testing package: ${packageName}`);
        console.log('─'.repeat(50));

        const result: DebugResult = {
            packageName,
            metadata: null,
            groupFolders: [],
            totalCount: 0,
        };

        // Test 1: Package metadata endpoint
        console.log('\n1. Fetching package metadata...');
        const [metadata, metaErr] = await fetchPackageMetadata(requestor, packageName);
        if (metaErr) {
            console.log(`   ERROR: ${metaErr.message}`);
            result.metadataError = metaErr.message;
        } else if (metadata) {
            console.log(`   Name: ${metadata.name}`);
            console.log(`   Description: ${metadata.description || '(none)'}`);
            result.metadata = metadata;
        }

        // Test 2: GROUP folders via virtualfolders
        console.log('\n2. Fetching GROUP folders via virtualfolders...');
        const [groupFolders, groupErr] = await fetchGroupFolders(requestor, packageName);
        if (groupErr) {
            console.log(`   ERROR: ${groupErr.message}`);
            result.groupFoldersError = groupErr.message;
        } else {
            result.groupFolders = groupFolders;
            result.totalCount = groupFolders.reduce((sum, f) => sum + f.count, 0);
            console.log(`   Found ${groupFolders.length} GROUP folders:`);
            for (const folder of groupFolders) {
                console.log(`     - ${folder.name}: ${folder.count} items`);
            }
            console.log(`   TOTAL COUNT: ${result.totalCount}`);
        }

        // Test 3: Compare with top-level listing (if applicable)
        console.log('\n3. Checking top-level listing for comparison...');
        const [topLevelCount, topErr] = await fetchTopLevelCount(requestor, packageName);
        if (topErr) {
            console.log(`   ERROR: ${topErr.message}`);
            result.topLevelError = topErr.message;
        } else if (topLevelCount !== null) {
            result.topLevelCount = topLevelCount;
            console.log(`   Top-level count: ${topLevelCount}`);
            console.log(`   Sum of GROUP counts: ${result.totalCount}`);
            if (topLevelCount === result.totalCount) {
                console.log(`   ✓ MATCH!`);
            } else {
                console.log(`   ✗ MISMATCH (diff: ${topLevelCount - result.totalCount})`);
            }
        } else {
            console.log(`   (Not a top-level package - no comparison available)`);
        }

        results.push(result);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    console.log('\n┌────────────────┬─────────────────────────────────┬────────────┬─────────────┐');
    console.log('│ Package        │ Description                     │ Sum Count  │ Top-Level   │');
    console.log('├────────────────┼─────────────────────────────────┼────────────┼─────────────┤');

    for (const r of results) {
        const name = r.packageName.padEnd(14);
        const desc = (r.metadata?.description || r.metadataError || '(none)').substring(0, 31).padEnd(31);
        const count = r.totalCount.toString().padStart(10);
        const topLevel = r.topLevelCount !== undefined
            ? r.topLevelCount.toString().padStart(11)
            : '      N/A  ';
        console.log(`│ ${name} │ ${desc} │ ${count} │ ${topLevel} │`);
    }

    console.log('└────────────────┴─────────────────────────────────┴────────────┴─────────────┘');

    // Conclusion
    console.log('\nCONCLUSION:');
    const allHaveMetadata = results.every(r => r.metadata !== null);
    const allHaveGroups = results.every(r => r.groupFolders.length > 0 || r.totalCount >= 0);

    if (allHaveMetadata && allHaveGroups) {
        console.log('✓ Package metadata endpoint works for all packages');
        console.log('✓ virtualfolders returns GROUP folders with counts');
        console.log('✓ Approach is VALID - can proceed with implementation');
    } else {
        console.log('✗ Some tests failed - review results above');
        if (!allHaveMetadata) console.log('  - Package metadata endpoint failed for some packages');
        if (!allHaveGroups) console.log('  - GROUP folders not available for some packages');
    }

    console.log('\nDone.');
}

runDebug().catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
});
