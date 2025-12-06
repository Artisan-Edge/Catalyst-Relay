/**
 * Shared Test Helpers for Integration Tests
 *
 * Provides common infrastructure for SAP ADT integration tests:
 * - Environment configuration
 * - Client creation and login
 * - Cleanup utilities
 * - Skip logic helpers
 */

import { createClient, loadConfig } from '../../core';
import type { ADTClient } from '../../core';
import type { ObjectRef } from '../../types/requests';

/**
 * Test configuration from environment variables
 */
export const TEST_CONFIG = {
    /** SAP client ID in format SystemId-ClientNumber (e.g., 'MediaDemo-DM1-200') */
    clientId: process.env['SAP_TEST_CLIENT_ID'] ?? 'MediaDemo-DM1-200',
    /** SAP username */
    username: process.env['SAP_TEST_USERNAME'] ?? '',
    /** SAP password */
    password: process.env['SAP_PASSWORD'] ?? '',
    /** Target package for test objects */
    package: process.env['SAP_TEST_PACKAGE'] ?? '$TMP',
    /** Transport request (optional, not needed for $TMP) */
    transport: process.env['SAP_TEST_TRANSPORT'] || undefined,
    /** Config file path */
    configPath: './config.json',
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
 * Check if credentials are available
 *
 * @returns true if username and password are set
 */
export function hasCredentials(): boolean {
    return Boolean(TEST_CONFIG.username && TEST_CONFIG.password);
}

/**
 * Create and login an ADT client
 *
 * Handles configuration loading, client creation, and login.
 * Returns null client if credentials are missing.
 *
 * @returns [client, error] tuple
 */
export async function createTestClient(): Promise<[ADTClient | null, Error | null]> {
    // Check for required credentials
    if (!hasCredentials()) {
        console.log('Skipping - SAP_TEST_USERNAME and SAP_PASSWORD not set');
        return [null, null];
    }

    // Load configuration
    const [config, configErr] = loadConfig(TEST_CONFIG.configPath);
    if (configErr) {
        return [null, new Error(`Failed to load config: ${configErr.message}`)];
    }

    // Parse client ID to get system and client number
    const parts = TEST_CONFIG.clientId.split('-');
    const clientNumber = parts.pop()!;
    const systemId = parts.join('-');
    const systemConfig = config.get(systemId);

    if (!systemConfig?.adt) {
        return [null, new Error(`System ${systemId} not found in config`)];
    }

    // Create client
    const [client, clientErr] = createClient({
        url: systemConfig.adt,
        client: clientNumber,
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
 * @returns true if test should be skipped
 */
export function shouldSkip(client: ADTClient | null): boolean {
    if (!client?.session) {
        console.log('Skipping - no session');
        return true;
    }
    return false;
}

/**
 * Safely delete test objects with error handling
 *
 * Logs warnings on failure but doesn't throw.
 * Use in afterAll for cleanup.
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
        console.log(`Cleaning up: deleting ${obj.name}`);
        const [, deleteErr] = await client.delete([obj], transport);
        if (deleteErr) {
            console.warn(`Failed to delete ${obj.name}: ${deleteErr.message}`);
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
