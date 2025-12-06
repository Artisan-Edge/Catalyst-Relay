/**
 * Configuration loading utilities
 *
 * Matches Python reference behavior:
 * - Load system URLs from config.json
 * - Parse clientId format: "SystemId-ClientNumber" (e.g., "MediaDemo-DM1-200")
 * - Support RELAY_CONFIG environment variable
 */

import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { Result } from '../types/result';
import { ok, err } from '../types/result';

/**
 * System configuration from config.json
 */
export interface SystemConfig {
    /** ADT server URL */
    adt: string | undefined;
    /** OData server URL (optional) */
    odata: string | undefined;
    /** Instance number (optional) */
    instanceNum: string | undefined;
}

/**
 * Loaded configuration map
 * Key: System ID (e.g., "MediaDemo-DM1")
 * Value: System configuration
 */
export type ConfigMap = Map<string, SystemConfig>;

/**
 * Zod schema for config.json validation
 */
const systemConfigSchema = z.record(
    z.string(),
    z.object({
        adt: z.string().url().optional(),
        odata: z.string().url().optional(),
        instance_num: z.string().optional(),
    })
);

/**
 * Parsed client ID components
 */
export interface ParsedClientId {
    /** System ID for config lookup (e.g., "MediaDemo-DM1") */
    systemId: string;
    /** SAP client number (e.g., "200") */
    clientNumber: string;
}

/**
 * Global config storage
 */
let globalConfig: ConfigMap | null = null;

/**
 * Load configuration from a JSON file
 *
 * @param path - Path to config.json
 * @returns Result with ConfigMap or error
 *
 * @example
 * ```typescript
 * const [config, err] = loadConfig('./config.json');
 * if (err) {
 *     console.error('Failed to load config:', err);
 *     return;
 * }
 * ```
 */
export function loadConfig(path: string): Result<ConfigMap, Error> {
    try {
        // Read and parse the JSON file.
        const content = readFileSync(path, 'utf-8');
        const raw = JSON.parse(content);

        // Validate config structure with Zod schema.
        const validation = systemConfigSchema.safeParse(raw);
        if (!validation.success) {
            const issues = validation.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join(', ');
            return err(new Error(`Invalid config format: ${issues}`));
        }

        // Convert validated data to ConfigMap.
        const configMap: ConfigMap = new Map();
        for (const [key, value] of Object.entries(validation.data)) {
            configMap.set(key, {
                adt: value.adt,
                odata: value.odata,
                instanceNum: value.instance_num,
            });
        }

        // Store globally for later access.
        globalConfig = configMap;

        return ok(configMap);
    } catch (error) {
        // Handle JSON parsing errors.
        if (error instanceof SyntaxError) {
            return err(new Error(`Invalid JSON in config file: ${error.message}`));
        }
        // Handle file not found errors.
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return err(new Error(`Config file not found: ${path}`));
        }
        return err(error instanceof Error ? error : new Error(String(error)));
    }
}

/**
 * Default config file path
 */
const DEFAULT_CONFIG_PATH = './config.json';

/**
 * Load configuration from RELAY_CONFIG environment variable
 *
 * Defaults to './config.json' if RELAY_CONFIG is not set.
 *
 * @returns Result with ConfigMap or error
 *
 * @example
 * ```typescript
 * // Uses RELAY_CONFIG env var, or defaults to './config.json'
 * const [config, err] = loadConfigFromEnv();
 * ```
 */

export function loadConfigFromEnv(): Result<ConfigMap, Error> {
    // Resolve config path from environment or use default.
    const configPath = process.env['RELAY_CONFIG'] ?? DEFAULT_CONFIG_PATH;
    return loadConfig(configPath);
}

/**
 * Get the currently loaded config
 *
 * @returns ConfigMap or null if not loaded
 */
export function getConfig(): ConfigMap | null {
    return globalConfig;
}

/**
 * Get system config by ID
 *
 * @param systemId - System ID (e.g., "MediaDemo-DM1")
 * @returns SystemConfig or null if not found
 */
export function getSystemConfig(systemId: string): SystemConfig | null {
    if (!globalConfig) return null;
    return globalConfig.get(systemId) ?? null;
}

/**
 * Parse a client ID into system ID and client number
 *
 * Format: "SystemId-ClientNumber" where SystemId can contain hyphens
 * Example: "MediaDemo-DM1-200" → { systemId: "MediaDemo-DM1", clientNumber: "200" }
 *
 * @param clientId - Full client ID string
 * @returns Result with parsed components or error
 *
 * @example
 * ```typescript
 * const [parsed, err] = parseClientId('MediaDemo-DM1-200');
 * if (err) return;
 * console.log(parsed.systemId);      // "MediaDemo-DM1"
 * console.log(parsed.clientNumber);  // "200"
 * ```
 */
export function parseClientId(clientId: string): Result<ParsedClientId, Error> {
    if (!clientId) {
        return err(new Error('Client ID is required'));
    }

    // Split by hyphen to extract components.
    const parts = clientId.split('-');
    if (parts.length < 2) {
        return err(new Error(`Invalid client ID format: "${clientId}". Expected "SystemId-ClientNumber" (e.g., "MediaDemo-DM1-200")`));
    }

    // Extract client number (last part) and system ID (everything before).
    const clientNumber = parts[parts.length - 1];
    const systemId = parts.slice(0, -1).join('-');

    // Validate client number is numeric.
    if (!clientNumber || !/^\d+$/.test(clientNumber)) {
        return err(new Error(`Invalid client number: "${clientNumber}". Must be numeric (e.g., "100", "200")`));
    }

    // Validate system ID is not empty.
    if (!systemId) {
        return err(new Error(`Invalid system ID in client ID: "${clientId}"`));
    }

    return ok({ systemId, clientNumber });
}

/**
 * Resolve a client ID to a full URL and client number
 *
 * @param clientId - Full client ID (e.g., "MediaDemo-DM1-200")
 * @returns Result with URL and client number or error
 *
 * @example
 * ```typescript
 * loadConfig('./config.json');
 * const [resolved, err] = resolveClientId('MediaDemo-DM1-200');
 * if (err) return;
 * console.log(resolved.url);          // "https://50.19.106.63:443"
 * console.log(resolved.clientNumber); // "200"
 * ```
 */
export function resolveClientId(clientId: string): Result<{ url: string; clientNumber: string }, Error> {
    // Parse the client ID into components.
    const [parsed, parseErr] = parseClientId(clientId);
    if (parseErr) {
        return err(parseErr);
    }

    // Ensure config is loaded.
    if (!globalConfig) {
        return err(new Error('Config not loaded. Call loadConfig() or loadConfigFromEnv() first.'));
    }

    // Lookup system configuration.
    const systemConfig = globalConfig.get(parsed.systemId);
    if (!systemConfig) {
        return err(new Error(`Unknown system ID: "${parsed.systemId}". Available: ${Array.from(globalConfig.keys()).join(', ')}`));
    }

    // Validate ADT URL is configured.
    if (!systemConfig.adt) {
        return err(new Error(`No ADT URL configured for system: "${parsed.systemId}"`));
    }

    return ok({
        url: systemConfig.adt,
        clientNumber: parsed.clientNumber,
    });
}

/**
 * Build a ClientConfig from a client ID and auth config
 *
 * Convenience function that resolves the client ID and builds
 * a complete ClientConfig ready for createClient().
 *
 * @param clientId - Full client ID (e.g., "MediaDemo-DM1-200")
 * @param auth - Authentication configuration
 * @returns Result with ClientConfig or error
 *
 * @example
 * ```typescript
 * loadConfig('./config.json');
 *
 * const [config, err] = buildClientConfig('MediaDemo-DM1-200', {
 *     type: 'basic',
 *     username: 'user',
 *     password: 'pass',
 * });
 * if (err) return;
 *
 * const [client, clientErr] = createClient(config);
 * ```
 */
export function buildClientConfig(
    clientId: string,
    auth: { type: 'basic'; username: string; password: string } |
          { type: 'saml'; username: string; password: string; provider?: string } |
          { type: 'sso'; certificate?: string }
): Result<{ url: string; client: string; auth: typeof auth }, Error> {
    // Resolve client ID to URL and client number.
    const [resolved, resolveErr] = resolveClientId(clientId);
    if (resolveErr) {
        return err(resolveErr);
    }

    // Build complete client configuration.
    return ok({
        url: resolved.url,
        client: resolved.clientNumber,
        auth,
    });
}
