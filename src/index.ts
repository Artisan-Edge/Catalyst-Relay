/**
 * Catalyst-Relay
 *
 * TypeScript middleware for SAP ADT integration.
 * Can be used as a library (direct imports) or as an HTTP server.
 *
 * @example Library usage
 * ```typescript
 * import { createClient } from 'catalyst-relay';
 *
 * const [client, error] = createClient({
 *     url: 'https://sap-server:443',
 *     client: '100',
 *     auth: { type: 'basic', username: 'user', password: 'pass' }
 * });
 * if (error) throw error;
 *
 * const [session, loginError] = await client.login();
 * if (loginError) throw loginError;
 *
 * const [data, readError] = await client.read([
 *     { name: 'ZTEST_VIEW', extension: 'asddls' }
 * ]);
 * ```
 *
 * @example Server usage
 * ```bash
 * bun run src/server.ts
 * ```
 */

// Core exports
export { createClient } from './core';
export type { ADTClient } from './core';

// Type exports
export type {
    // Config
    AuthType,
    AuthConfig,
    BasicAuthConfig,
    SamlAuthConfig,
    SsoAuthConfig,
    ClientConfig,
    // Requests
    ObjectRef,
    ObjectContent,
    TreeQuery,
    PreviewQuery,
    Filter,
    FilterOperator,
    OrderBy,
    // Responses
    Session,
    ObjectMetadata,
    ObjectWithContent,
    UpsertResult,
    ActivationResult,
    ActivationMessage,
    TreeNode,
    Transport,
    Package,
    DataFrame,
    ColumnInfo,
    DistinctResult,
    SearchResult,
    Dependency,
    ApiResponse,
    SuccessResponse,
    ErrorResponse,
    ErrorCode,
    // Result
    Result,
    AsyncResult,
} from './types';

// Result utilities
export { ok, err } from './types/result';
