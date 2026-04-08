/**
 * Shared Test Helpers for Integration Tests
 *
 * Provides common infrastructure for SAP ADT integration tests:
 * - Environment configuration
 * - Client creation and login
 * - Cleanup utilities
 * - Skip logic helpers
 */

import { execSync } from 'child_process';
import { Entry } from '@napi-rs/keyring';
import { createClient } from '../../core';
import type { ADTClient } from '../../core';
import type { ObjectRef } from '../../types/requests';

// Keyring constants (matches Catalyst-CLI's storage format)
const KEYRING_SERVICE = 'Catalyst-CLI';

function readFromKeyring(alias: string, credType: 'username' | 'password'): string | null {
    try {
        const entry = new Entry(KEYRING_SERVICE, `${alias}:basic:${credType}`);
        return entry.getPassword();
    } catch {
        return null;
    }
}

/**
 * Test configuration from environment variables
 */
export const TEST_CONFIG = {
    /** SAP ADT server URL (e.g., 'https://hostname:port') */
    adtUrl: process.env['SAP_TEST_ADT_URL'] ?? '',
    /** SAP client number (e.g., '100', '200') */
    client: process.env['SAP_TEST_CLIENT'] ?? '',
    /** SAP username */
    username: process.env['SAP_TEST_USERNAME'] ?? '',
    /** SAP password */
    password: process.env['SAP_PASSWORD'] ?? '',
    /** Target package for test objects */
    package: process.env['SAP_TEST_PACKAGE'] ?? '$TMP',
    /** Transport request (optional, not needed for $TMP) */
    transport: process.env['SAP_TEST_TRANSPORT'] || undefined,
    /** System alias for keyring credential lookup */
    systemAlias: process.env['SAP_TEST_SYSTEM_ALIAS'] ?? '',
};

/**
 * Generate a unique test object name
 *
 * Uses timestamp to ensure uniqueness across test runs.
 * Format: {prefix}_{timestamp} (e.g., 'ZSNAP_TEST_M1A2B3C4')
 *
 * @param prefix - Name prefix (default: 'ZSNAP_TEST')
 * @returns Unique uppercase name
 */
export function generateTestName(prefix = 'ZSNAP_TEST'): string {
    return `${prefix}_${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Resolve system URL and client from Catalyst CLI when a system alias is configured.
 */
function resolveSystemConfig(alias: string): { url: string; client: string } | null {
    try {
        const output = execSync('catalyst adt systems list --format json', { encoding: 'utf-8' });
        const data = JSON.parse(output) as { systems: { alias: string; url: string; client: string }[] };
        const system = data.systems.find(s => s.alias === alias);
        return system ? { url: system.url, client: system.client } : null;
    } catch {
        return null;
    }
}

/**
 * Resolve credentials and system config when SAP_TEST_SYSTEM_ALIAS is set.
 * Uses the Catalyst CLI for URL/client and OS keyring for username/password.
 */
function resolveCredentials(): void {
    const alias = TEST_CONFIG.systemAlias;
    if (!alias) return;

    // Resolve URL and client from Catalyst CLI
    const systemConfig = resolveSystemConfig(alias);
    if (systemConfig) {
        TEST_CONFIG.adtUrl = systemConfig.url;
        TEST_CONFIG.client = systemConfig.client;
        console.log(`Resolved system config from Catalyst CLI (${alias}): ${systemConfig.url} client ${systemConfig.client}`);
    }

    if (!TEST_CONFIG.password) {
        const keyringPassword = readFromKeyring(alias, 'password');
        if (keyringPassword) {
            TEST_CONFIG.password = keyringPassword;
            console.log(`Resolved password from OS keyring (${KEYRING_SERVICE}/${alias}:basic:password)`);
        }
    }

    if (!TEST_CONFIG.username) {
        const keyringUsername = readFromKeyring(alias, 'username');
        if (keyringUsername) {
            TEST_CONFIG.username = keyringUsername;
            console.log(`Resolved username from OS keyring (${KEYRING_SERVICE}/${alias}:basic:username)`);
        }
    }
}

/**
 * Validate that all required credentials are set
 *
 * @throws Error if any required credential is missing
 */
export function validateCredentials(): void {
    resolveCredentials();

    const missing: string[] = [];
    if (!TEST_CONFIG.adtUrl) missing.push('SAP_TEST_ADT_URL');
    if (!TEST_CONFIG.client) missing.push('SAP_TEST_CLIENT');
    if (!TEST_CONFIG.username) missing.push('SAP_TEST_USERNAME');
    if (!TEST_CONFIG.password) missing.push('SAP_PASSWORD');

    if (missing.length > 0) {
        const hint = TEST_CONFIG.systemAlias
            ? ` (keyring lookup for alias "${TEST_CONFIG.systemAlias}" also failed — store credentials with: catalyst systems add ${TEST_CONFIG.systemAlias})`
            : ' (set SAP_TEST_SYSTEM_ALIAS to enable keyring fallback)';
        throw new Error(`Missing required credentials: ${missing.join(', ')}${hint}`);
    }
}

/**
 * Create and login an ADT client
 *
 * Uses environment variables for configuration.
 * Throws if credentials are missing.
 *
 * @returns [client, error] tuple
 */
export async function createTestClient(): Promise<[ADTClient | null, Error | null]> {
    // Validate required credentials - throws if missing
    validateCredentials();

    // Create client directly from environment variables
    const [client, clientErr] = createClient({
        url: TEST_CONFIG.adtUrl,
        client: TEST_CONFIG.client,
        auth: {
            type: 'basic',
            username: TEST_CONFIG.username,
            password: TEST_CONFIG.password,
        },
        insecure: true,
    });

    if (clientErr) {
        return [null, new Error(`Failed to create client: ${clientErr.message}`)];
    }

    // Login
    const [session, loginErr] = await client.login();
    if (loginErr) {
        return [null, new Error(`Failed to login: ${loginErr.message}`)];
    }

    console.log(`Logged in as ${session.username}`);
    return [client, null];
}

/**
 * Check if a test should be skipped due to missing session
 *
 * @param client - ADT client (may be null)
 * @throws Error if no session is available
 * @returns false (never returns true - throws instead)
 */
export function shouldSkip(client: ADTClient | null): boolean {
    if (!client?.session) {
        throw new Error('No active session - login may have failed');
    }
    return false;
}

/**
 * Generate valid stub source for an object type.
 * Used to overwrite objects (potentially with invalid source) before activation.
 */
function stubSource(name: string, extension: string): string | null {
    const lower = name.toLowerCase();
    switch (extension) {
        case 'aclass':
            return `CLASS ${lower} DEFINITION PUBLIC FINAL CREATE PUBLIC. ENDCLASS.\nCLASS ${lower} IMPLEMENTATION. ENDCLASS.`;
        case 'asprog':
            return `REPORT ${lower}.`;
        case 'asddls':
            return `@AbapCatalog.sqlViewName: '${name.substring(0, 16)}'\n@AbapCatalog.compiler.compareFilter: true\ndefine view ${name} as select from t000 { mandt }`;
        case 'asdcls':
            return `@MappingRole: true\ndefine role ${name} { }`;
        case 'astabldt':
            return `@EndUserText.label: 'Test'\ndefine table ${lower} {\n  key client: abap.clnt;\n}`;
        default:
            return null;
    }
}

/**
 * Safely delete test objects with error handling.
 *
 * Overwrites with valid stub source and activates before deleting,
 * to prevent ghost inactive objects in SAP's repository.
 *
 * @param client - ADT client
 * @param objects - Objects to delete
 * @param transport - Optional transport request
 */
export async function safeDelete(
    client: ADTClient,
    objects: ObjectRef[],
    transport?: string
): Promise<void> {
    if (!client?.session) return;
    if (objects.length === 0) return;

    for (const obj of objects) {
        console.log(`Cleaning up: ${obj.name}`);

        const stub = stubSource(obj.name, obj.extension);
        if (stub) {
            const [, updateErr] = await client.update({ ...obj, content: stub }, transport);
            if (updateErr) {
                console.warn(`  Failed to overwrite ${obj.name}: ${updateErr.message}`);
            }

            const [, activateErr] = await client.activate([obj]);
            if (activateErr) {
                console.warn(`  Failed to activate ${obj.name}: ${activateErr.message}`);
            }
        }

        const [, deleteErr] = await client.delete([obj], transport);
        if (deleteErr) {
            console.warn(`  Failed to delete ${obj.name}: ${deleteErr.message}`);
        }
    }
}

/**
 * Safely logout from client
 *
 * @param client - ADT client
 */
export async function safeLogout(client: ADTClient | null): Promise<void> {
    if (!client?.session) return;

    const [, logoutErr] = await client.logout();
    if (logoutErr) {
        console.warn(`Logout warning: ${logoutErr.message}`);
    }
}
