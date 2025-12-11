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

// Config types
export type {
    AuthType,
    AuthConfig,
    BasicAuthConfig,
    SamlAuthConfig,
    SsoAuthConfig,
    ClientConfig,
} from './types/config';

// Request types
export type {
    ObjectRef,
    ObjectContent,
    TreeQuery,
    PreviewQuery,
} from './types/requests';

// Response wrappers
export type {
    ApiResponse,
    SuccessResponse,
    ErrorResponse,
    ErrorCode,
} from './types/responses';

// Result types
export type { Result, AsyncResult } from './types/result';

// Session types
export type { Session } from './core/session/types';

// ADT domain types
export type {
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
    DiffResult,
    TransportConfig,
    ObjectConfig,
} from './core/adt';

// Result utilities
export { ok, err } from './types/result';
