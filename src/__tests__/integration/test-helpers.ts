/**
 * Shared Test Helpers for Integration Tests
 *
 * Provides common infrastructure for SAP ADT integration tests:
 * - Environment configuration
 * - Client creation and login
 * - Cleanup utilities
 * - Skip logic helpers
 */

import { createClient } from '../../core';
import type { ADTClient } from '../../core';
import type { ObjectRef } from '../../types/requests';

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
 * Validate that all required credentials are set
 *
 * @throws Error if any required credential is missing
 */
export function validateCredentials(): void {
    const missing: string[] = [];
    if (!TEST_CONFIG.adtUrl) missing.push('SAP_TEST_ADT_URL');
    if (!TEST_CONFIG.client) missing.push('SAP_TEST_CLIENT');
    if (!TEST_CONFIG.username) missing.push('SAP_TEST_USERNAME');
    if (!TEST_CONFIG.password) missing.push('SAP_PASSWORD');

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
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
