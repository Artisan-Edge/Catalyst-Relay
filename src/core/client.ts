/**
 * ADT Client Core Implementation
 *
 * HTTP client for SAP ADT (ABAP Development Tools) with:
 * - Session management (login/logout)
 * - CSRF token fetching and automatic refresh
 * - Basic authentication (SAML and SSO to be implemented)
 * - Automatic retry on 403 CSRF errors
 * - Session reset on 500 errors
 *
 * Uses web standard APIs (fetch, Request, Response) - runtime-agnostic.
 * High-level ADT operations (CRAUD, preview, etc.) are stubs to be implemented.
 */

import type { ClientConfig } from '../types/config';
import type {
    ObjectRef,
    ObjectContent,
    TreeQuery,
    PreviewQuery,
} from '../types/requests';
import type {
    Session,
    ObjectWithContent,
    UpsertResult,
    ActivationResult,
    TreeNode,
    Transport,
    Package,
    DataFrame,
    DistinctResult,
    SearchResult,
    Dependency,
} from '../types/responses';
import type { Result, AsyncResult } from '../types/result';
import { ok, err } from '../types/result';
import {
    CSRF_TOKEN_HEADER,
    BASE_HEADERS,
    DEFAULT_TIMEOUT,
    buildRequestHeaders,
    extractCsrfToken
} from './utils';
import { clientConfigSchema } from '../types/config';
import * as sessionOps from './session/login';

// HTTP request options for internal operations
interface RequestOptions {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    params?: Record<string, string | number>;
    headers?: Record<string, string>;
    body?: string;
}

// ADT Client interface - provides all operations for interacting with SAP ADT servers
export interface ADTClient {
    /** Current session info (null if not logged in) */
    readonly session: Session | null;

    // Lifecycle
    login(): AsyncResult<Session>;
    logout(): AsyncResult<void>;

    // CRAUD Operations
    read(objects: ObjectRef[]): AsyncResult<ObjectWithContent[]>;
    upsert(objects: ObjectContent[], transport: string): AsyncResult<UpsertResult[]>;
    activate(objects: ObjectRef[]): AsyncResult<ActivationResult[]>;
    delete(objects: ObjectRef[], transport?: string): AsyncResult<void>;

    // Discovery
    getPackages(): AsyncResult<Package[]>;
    getTree(query: TreeQuery): AsyncResult<TreeNode[]>;
    getTransports(packageName: string): AsyncResult<Transport[]>;

    // Data Preview
    previewData(query: PreviewQuery): AsyncResult<DataFrame>;
    getDistinctValues(objectName: string, column: string): AsyncResult<DistinctResult>;
    countRows(objectName: string, objectType: 'table' | 'view'): AsyncResult<number>;

    // Search
    search(query: string, types?: string[]): AsyncResult<SearchResult[]>;
    whereUsed(object: ObjectRef): AsyncResult<Dependency[]>;
}

// Internal client state (implements SessionState interface from session/login)
interface ClientState extends sessionOps.SessionState {
    config: ClientConfig;
}

// Build URL search parameters with sap-client
function buildParams(
    baseParams: Record<string, string | number> | undefined,
    clientNum: string
): URLSearchParams {
    const params = new URLSearchParams();

    // Add any custom parameters from the request.
    if (baseParams) {
        for (const [key, value] of Object.entries(baseParams)) {
            params.append(key, String(value));
        }
    }

    // Always append sap-client parameter.
    params.append('sap-client', clientNum);

    return params;
}

// Build full URL from base URL and path
function buildUrl(baseUrl: string, path: string, params?: URLSearchParams): string {
    // Construct URL from base and path.
    const url = new URL(path, baseUrl);

    // Append query parameters if provided.
    if (params) {
        url.search = params.toString();
    }

    return url.toString();
}

// Create a new ADT client - validates config and returns client instance
export function createClient(config: ClientConfig): Result<ADTClient, Error> {
    // Validate config using Zod schema.
    const validation = clientConfigSchema.safeParse(config);
    if (!validation.success) {
        const issues = validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        return err(new Error(`Invalid client configuration: ${issues}`));
    }

    // Initialize client state with config and empty session.
    const state: ClientState = {
        config,
        session: null,
        csrfToken: null,
    };

    // Core HTTP request function with CSRF token injection and automatic retry on 403 errors
    async function request(options: RequestOptions): AsyncResult<Response, Error> {
        const { method, path, params, headers: customHeaders, body } = options;

        // Build headers with auth and CSRF token.
        const headers = buildRequestHeaders(
            BASE_HEADERS,
            customHeaders,
            config.auth,
            state.csrfToken
        );

        // Build URL with parameters.
        const urlParams = buildParams(params, config.client);
        const url = buildUrl(config.url, path, urlParams);

        // Build fetch options with timeout.
        const fetchOptions: RequestInit = {
            method,
            headers,
            signal: AbortSignal.timeout(config.timeout ?? DEFAULT_TIMEOUT),
        };

        // Add request body if provided.
        if (body) {
            fetchOptions.body = body;
        }

        // Handle insecure SSL (dev only)
        // NOTE: In Node.js, this would require setting NODE_TLS_REJECT_UNAUTHORIZED
        // For now, we rely on the environment configuration

        try {
            // Execute HTTP request.
            const response = await fetch(url, fetchOptions);

            // Handle CSRF token validation failure with automatic refresh.
            if (response.status === 403) {
                const text = await response.text();
                if (text.includes('CSRF token validation failed')) {
                    // Fetch new CSRF token.
                    const [newToken, tokenErr] = await sessionOps.fetchCsrfToken(state, request);
                    if (tokenErr) {
                        return err(new Error(`CSRF token refresh failed: ${tokenErr.message}`));
                    }

                    // Retry request with new token.
                    headers[CSRF_TOKEN_HEADER] = newToken;
                    const retryResponse = await fetch(url, { ...fetchOptions, headers });
                    return ok(retryResponse);
                }

                // Return 403 response if not CSRF-related.
                return ok(new Response(text, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                }));
            }

            // Handle session expiration with automatic reset.
            if (response.status === 500) {
                const text = await response.text();

                // Attempt session reset.
                const [, resetErr] = await sessionOps.sessionReset(state, request);
                if (resetErr) {
                    return err(new Error(`Session reset failed: ${resetErr.message}`));
                }

                // Return original 500 response.
                return ok(new Response(text, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                }));
            }

            return ok(response);
        } catch (error) {
            // Convert caught errors to Error type.
            if (error instanceof Error) {
                return err(error);
            }
            return err(new Error(`Network error: ${String(error)}`));
        }
    }

    const client: ADTClient = {
        get session() {
            return state.session;
        },

        async login(): AsyncResult<Session> {
            return sessionOps.login(state, request);
        },

        async logout(): AsyncResult<void> {
            return sessionOps.logout(state, request);
        },

        // NOTE: All methods below are stubs that check for session and return "Not implemented"
        // Full implementations will be added in src/core/adt/ modules

        async read(objects: ObjectRef[]): AsyncResult<ObjectWithContent[]> {
            if (!state.session) return err(new Error('Not logged in'));
            return err(new Error('Not implemented'));
        },

        async upsert(objects: ObjectContent[], transport: string): AsyncResult<UpsertResult[]> {
            if (!state.session) return err(new Error('Not logged in'));
            return err(new Error('Not implemented'));
        },

        async activate(objects: ObjectRef[]): AsyncResult<ActivationResult[]> {
            if (!state.session) return err(new Error('Not logged in'));
            return err(new Error('Not implemented'));
        },

        async delete(objects: ObjectRef[], transport?: string): AsyncResult<void> {
            if (!state.session) return err(new Error('Not logged in'));
            return err(new Error('Not implemented'));
        },

        async getPackages(): AsyncResult<Package[]> {
            if (!state.session) return err(new Error('Not logged in'));
            return err(new Error('Not implemented'));
        },

        async getTree(query: TreeQuery): AsyncResult<TreeNode[]> {
            if (!state.session) return err(new Error('Not logged in'));
            return err(new Error('Not implemented'));
        },

        async getTransports(packageName: string): AsyncResult<Transport[]> {
            if (!state.session) return err(new Error('Not logged in'));
            return err(new Error('Not implemented'));
        },

        async previewData(query: PreviewQuery): AsyncResult<DataFrame> {
            if (!state.session) return err(new Error('Not logged in'));
            return err(new Error('Not implemented'));
        },

        async getDistinctValues(objectName: string, column: string): AsyncResult<DistinctResult> {
            if (!state.session) return err(new Error('Not logged in'));
            return err(new Error('Not implemented'));
        },

        async countRows(objectName: string, objectType: 'table' | 'view'): AsyncResult<number> {
            if (!state.session) return err(new Error('Not logged in'));
            return err(new Error('Not implemented'));
        },

        async search(query: string, types?: string[]): AsyncResult<SearchResult[]> {
            if (!state.session) return err(new Error('Not logged in'));
            return err(new Error('Not implemented'));
        },

        async whereUsed(object: ObjectRef): AsyncResult<Dependency[]> {
            if (!state.session) return err(new Error('Not logged in'));
            return err(new Error('Not implemented'));
        },
    };

    return ok(client);
}
