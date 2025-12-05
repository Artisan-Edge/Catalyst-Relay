/**
 * ADT Client Core Implementation
 *
 * This module provides the core HTTP client for SAP ADT (ABAP Development Tools).
 * It handles:
 * - Session management (login/logout)
 * - CSRF token fetching and automatic refresh
 * - Basic authentication (SAML and SSO to be implemented)
 * - Automatic retry on 403 CSRF errors
 * - Session reset on 500 errors
 *
 * The client uses web standard APIs (fetch, Request, Response) and is
 * runtime-agnostic - it works in both Node.js and Bun environments.
 *
 * High-level ADT operations (CRAUD, preview, etc.) are stubs to be
 * implemented in Stream 5.
 */

import type { ClientConfig, AuthConfig } from '../types/config';
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
import { FETCH_CSRF_TOKEN, CSRF_TOKEN_HEADER } from './utils/csrf';
import { clientConfigSchema } from '../types/config';

/**
 * Base headers for all ADT requests
 * Mimics Eclipse ADT plugin to ensure compatibility
 */
const BASE_HEADERS = {
    'X-sap-adt-sessiontype': 'stateful',
    'User-Agent': 'Eclipse/4.34.0 ADT/3.46.0',
    'X-sap-adt-profiling': 'server-time',
} as const;

/**
 * Default request timeout in milliseconds
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * HTTP request options for internal operations
 */
interface RequestOptions {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    params?: Record<string, string | number>;
    headers?: Record<string, string>;
    body?: string;
}

/**
 * ADT Client interface
 *
 * Provides all operations for interacting with SAP ADT servers.
 * Handles session management, CSRF tokens, and error normalization internally.
 */
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

/**
 * Internal client state
 */
interface ClientState {
    config: ClientConfig;
    session: Session | null;
    csrfToken: string | null;
    isLoggedIn: boolean;
}

/**
 * Build URL search parameters
 */
function buildParams(
    baseParams: Record<string, string | number> | undefined,
    clientNum: string
): URLSearchParams {
    const params = new URLSearchParams();

    // Add user-provided params
    if (baseParams) {
        for (const [key, value] of Object.entries(baseParams)) {
            params.append(key, String(value));
        }
    }

    // Always append sap-client parameter
    params.append('sap-client', clientNum);

    return params;
}

/**
 * Build full URL from base URL and path
 */
function buildUrl(baseUrl: string, path: string, params?: URLSearchParams): string {
    const url = new URL(path, baseUrl);

    if (params) {
        url.search = params.toString();
    }

    return url.toString();
}

/**
 * Extract CSRF token from response headers
 * SAP returns token in both upper and lowercase variations
 */
function extractCsrfToken(headers: Headers): string | null {
    // Try both upper and lowercase header names
    const token = headers.get(CSRF_TOKEN_HEADER) ||
                  headers.get(CSRF_TOKEN_HEADER.toLowerCase());

    // Ignore the fetch token itself
    if (!token || token === FETCH_CSRF_TOKEN) {
        return null;
    }

    return token;
}

/**
 * Create a new ADT client
 *
 * @param config - Client configuration
 * @returns Result tuple with client or error
 *
 * @example
 * const [client, error] = await createClient({
 *     url: 'https://sap-server:443',
 *     client: '100',
 *     auth: { type: 'basic', username: 'user', password: 'pass' }
 * });
 * if (error) {
 *     console.error('Failed to create client:', error);
 *     return;
 * }
 * const [session, loginError] = await client.login();
 */
export function createClient(config: ClientConfig): Result<ADTClient, Error> {
    // Validate config using Zod schema
    const validation = clientConfigSchema.safeParse(config);
    if (!validation.success) {
        const issues = validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        return err(new Error(`Invalid client configuration: ${issues}`));
    }

    const state: ClientState = {
        config,
        session: null,
        csrfToken: null,
        isLoggedIn: false,
    };

    /**
     * Core HTTP request function
     * Handles CSRF token injection and automatic retry on 403 errors
     */
    async function request(options: RequestOptions): AsyncResult<Response, Error> {
        const { method, path, params, headers: customHeaders, body } = options;

        // Build headers with base headers and CSRF token
        const headers: Record<string, string> = {
            ...BASE_HEADERS,
            ...customHeaders,
        };

        // Add basic auth header if using basic authentication
        if (config.auth.type === 'basic') {
            // Use btoa for base64 encoding (web standard, available in both Node 18+ and Bun)
            const credentials = btoa(`${config.auth.username}:${config.auth.password}`);
            headers['Authorization'] = `Basic ${credentials}`;
        }

        // Add CSRF token if we have one
        if (state.csrfToken && state.csrfToken !== FETCH_CSRF_TOKEN) {
            headers[CSRF_TOKEN_HEADER] = state.csrfToken;
        }

        // Build URL with parameters
        const urlParams = buildParams(params, config.client);
        const url = buildUrl(config.url, path, urlParams);

        // Build fetch options
        const fetchOptions: RequestInit = {
            method,
            headers,
            signal: AbortSignal.timeout(config.timeout ?? DEFAULT_TIMEOUT),
        };

        if (body) {
            fetchOptions.body = body;
        }

        // Handle insecure SSL (dev only)
        // NOTE: In Node.js, this would require setting NODE_TLS_REJECT_UNAUTHORIZED
        // For now, we rely on the environment configuration

        try {
            const response = await fetch(url, fetchOptions);

            // Check for CSRF token validation failure
            if (response.status === 403) {
                const text = await response.text();
                if (text.includes('CSRF token validation failed')) {
                    // Attempt to fetch new token and retry
                    const [newToken, tokenErr] = await fetchCsrfToken();
                    if (tokenErr) {
                        return err(new Error(`CSRF token refresh failed: ${tokenErr.message}`));
                    }

                    // Retry the request with new token
                    headers[CSRF_TOKEN_HEADER] = newToken;
                    const retryResponse = await fetch(url, { ...fetchOptions, headers });
                    return ok(retryResponse);
                }

                // Return the 403 response if not CSRF-related
                return ok(new Response(text, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                }));
            }

            // Check for session expiration (500 with specific error)
            if (response.status === 500) {
                const text = await response.text();
                // Attempt session reset
                const [, resetErr] = await sessionReset();
                if (resetErr) {
                    return err(new Error(`Session reset failed: ${resetErr.message}`));
                }

                // Return the error response for caller to handle
                return ok(new Response(text, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                }));
            }

            return ok(response);
        } catch (error) {
            if (error instanceof Error) {
                return err(error);
            }
            return err(new Error(`Network error: ${String(error)}`));
        }
    }

    /**
     * Fetch CSRF token from SAP ADT server
     * Endpoint and content type vary by auth type
     */
    async function fetchCsrfToken(): AsyncResult<string, Error> {
        // Determine endpoint based on auth type
        const endpoint = config.auth.type === 'saml'
            ? '/sap/bc/adt/core/http/sessions'
            : '/sap/bc/adt/compatibility/graph';

        const contentType = config.auth.type === 'saml'
            ? 'application/vnd.sap.adt.core.http.session.v3+xml'
            : 'application/xml';

        const headers = {
            [CSRF_TOKEN_HEADER]: FETCH_CSRF_TOKEN,
            'Content-Type': contentType,
            'Accept': contentType,
        };

        const [response, requestErr] = await request({
            method: 'GET',
            path: endpoint,
            headers,
        });

        if (requestErr) {
            return err(new Error(`Failed to fetch CSRF token: ${requestErr.message}`));
        }

        if (!response.ok) {
            const text = await response.text();
            return err(new Error(`CSRF token fetch failed with status ${response.status}: ${text}`));
        }

        // Extract token from response headers
        const token = extractCsrfToken(response.headers);
        if (!token) {
            return err(new Error('No CSRF token returned in response headers'));
        }

        // Update state
        state.csrfToken = token;
        state.isLoggedIn = true;

        return ok(token);
    }

    /**
     * Reset session by logging out and logging back in
     */
    async function sessionReset(): AsyncResult<void, Error> {
        // Try to logout gracefully (ignore errors)
        await logoutInternal();

        // Reset state
        state.csrfToken = null;
        state.isLoggedIn = false;
        state.session = null;

        // Login again
        const [, loginErr] = await loginInternal();
        if (loginErr) {
            return err(loginErr);
        }

        return ok(undefined);
    }

    /**
     * Internal login implementation
     * Handles SAML cookie exchange if needed
     */
    async function loginInternal(): AsyncResult<Session, Error> {
        // For SAML, we need to perform browser-based authentication first
        // TODO: Implement SAML authentication flow
        if (config.auth.type === 'saml') {
            return err(new Error('SAML authentication not yet implemented'));
        }

        // For SSO, credentials are handled via certificates
        // TODO: Implement SSO certificate handling
        if (config.auth.type === 'sso') {
            return err(new Error('SSO authentication not yet implemented'));
        }

        // For basic auth, credentials are sent with each request via Authorization header
        // The fetch CSRF token call will authenticate us
        const [token, tokenErr] = await fetchCsrfToken();
        if (tokenErr) {
            return err(new Error(`Login failed: ${tokenErr.message}`));
        }

        // Extract username from auth config
        const username = config.auth.type === 'basic' ? config.auth.username : '';

        // Create session object
        const session: Session = {
            sessionId: token,
            username,
            expiresAt: Date.now() + (8 * 60 * 60 * 1000), // 8 hours default
        };

        state.session = session;

        return ok(session);
    }

    /**
     * Internal logout implementation
     */
    async function logoutInternal(): AsyncResult<void, Error> {
        const [response, requestErr] = await request({
            method: 'POST',
            path: '/sap/public/bc/icf/logoff',
        });

        if (requestErr) {
            return err(new Error(`Logout failed: ${requestErr.message}`));
        }

        if (!response.ok) {
            const text = await response.text();
            return err(new Error(`Logout failed with status ${response.status}: ${text}`));
        }

        // Clear state
        state.csrfToken = null;
        state.isLoggedIn = false;
        state.session = null;

        return ok(undefined);
    }

    const client: ADTClient = {
        get session() {
            return state.session;
        },

        async login(): AsyncResult<Session> {
            return loginInternal();
        },

        async logout(): AsyncResult<void> {
            return logoutInternal();
        },

        async read(objects: ObjectRef[]): AsyncResult<ObjectWithContent[]> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement batch read
            return err(new Error('Not implemented'));
        },

        async upsert(objects: ObjectContent[], transport: string): AsyncResult<UpsertResult[]> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement batch upsert
            return err(new Error('Not implemented'));
        },

        async activate(objects: ObjectRef[]): AsyncResult<ActivationResult[]> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement batch activation
            return err(new Error('Not implemented'));
        },

        async delete(objects: ObjectRef[], transport?: string): AsyncResult<void> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement batch delete
            return err(new Error('Not implemented'));
        },

        async getPackages(): AsyncResult<Package[]> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement package discovery
            return err(new Error('Not implemented'));
        },

        async getTree(query: TreeQuery): AsyncResult<TreeNode[]> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement tree discovery
            return err(new Error('Not implemented'));
        },

        async getTransports(packageName: string): AsyncResult<Transport[]> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement transport listing
            return err(new Error('Not implemented'));
        },

        async previewData(query: PreviewQuery): AsyncResult<DataFrame> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement data preview
            return err(new Error('Not implemented'));
        },

        async getDistinctValues(objectName: string, column: string): AsyncResult<DistinctResult> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement distinct values
            return err(new Error('Not implemented'));
        },

        async countRows(objectName: string, objectType: 'table' | 'view'): AsyncResult<number> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement row count
            return err(new Error('Not implemented'));
        },

        async search(query: string, types?: string[]): AsyncResult<SearchResult[]> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement search
            return err(new Error('Not implemented'));
        },

        async whereUsed(object: ObjectRef): AsyncResult<Dependency[]> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement where-used
            return err(new Error('Not implemented'));
        },
    };

    return ok(client);
}
