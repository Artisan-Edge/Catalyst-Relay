/**
 * ADT Client Core Implementation
 *
 * HTTP client for SAP ADT (ABAP Development Tools) with:
 * - Session management (login/logout)
 * - CSRF token fetching and automatic refresh
 * - Basic, SAML, and SSO (Kerberos + mTLS) authentication
 * - Automatic retry on 403 CSRF errors
 * - Session reset on 500 errors
 *
 * Uses web standard APIs (fetch, Request, Response) - runtime-agnostic.
 */

import type { ClientConfig } from '../types/config';
import type {
    ObjectRef,
    ObjectContent,
    TreeQuery,
    PreviewSQL,
} from '../types/requests';
import type { Session } from './session/types';
import type {
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
    TransportConfig,
    DiffResult,
    ObjectConfig,
    Parameter,
} from './adt';
import type { Result, AsyncResult } from '../types/result';
import { ok, err } from '../types/result';
import {
    CSRF_TOKEN_HEADER,
    BASE_HEADERS,
    DEFAULT_TIMEOUT,
    buildRequestHeaders,
    debug,
    debugError,
} from './utils';
import { clientConfigSchema } from '../types/config';
import * as sessionOps from './session/login';
import * as adt from './adt';
import { Agent, fetch as undiciFetch } from 'undici';
import type { AuthStrategy } from './auth/types';
import { createAuthStrategy } from './auth/factory';

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
    create(object: ObjectContent, packageName: string, transport?: string): AsyncResult<void>;
    update(object: ObjectContent, transport?: string): AsyncResult<void>;
    upsert(objects: ObjectContent[], packageName: string, transport?: string): AsyncResult<UpsertResult[]>;
    activate(objects: ObjectRef[]): AsyncResult<ActivationResult[]>;
    delete(objects: ObjectRef[], transport?: string): AsyncResult<void>;

    // Discovery
    getPackages(): AsyncResult<Package[]>;
    getTree(query: TreeQuery): AsyncResult<TreeNode[]>;
    getTransports(packageName: string): AsyncResult<Transport[]>;

    // Data Preview
    previewData(query: PreviewSQL): AsyncResult<DataFrame>;
    getDistinctValues(objectName: string, parameters: Parameter[], column: string, objectType?: 'table' | 'view'): AsyncResult<DistinctResult>;
    countRows(objectName: string, objectType: 'table' | 'view'): AsyncResult<number>;

    // Search
    search(query: string, types?: string[]): AsyncResult<SearchResult[]>;
    whereUsed(object: ObjectRef): AsyncResult<Dependency[]>;

    // Transport Management
    createTransport(config: TransportConfig): AsyncResult<string>;

    // Diff Operations
    gitDiff(objects: ObjectContent[]): AsyncResult<DiffResult[]>;

    // Configuration
    getObjectConfig(): ObjectConfig[];
}

// Internal client state (implements SessionState interface from session/login)
interface ClientState extends sessionOps.SessionState {
    config: ClientConfig;
    cookies: Map<string, string>;
    authStrategy: AuthStrategy;
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

    // Merge query parameters: preserve existing ones from path, add new ones.
    if (params) {
        for (const [key, value] of params.entries()) {
            url.searchParams.append(key, value);
        }
    }

    return url.toString();
}

/**
 * ADT Client implementation class.
 * Methods are defined on the prototype (not recreated per instance).
 */
class ADTClientImpl implements ADTClient {
    private state: ClientState;
    private requestor: adt.AdtRequestor;
    private agent: Agent | undefined;

    constructor(config: ClientConfig) {
        // Create auth strategy from config
        const authOptions: Parameters<typeof createAuthStrategy>[0] = {
            config: config.auth,
            baseUrl: config.url,
        };
        if (config.insecure) {
            authOptions.insecure = config.insecure;
        }
        const authStrategy = createAuthStrategy(authOptions);

        this.state = {
            config,
            session: null,
            csrfToken: null,
            cookies: new Map(),
            authStrategy,
        };
        // Bind request method for use as requestor
        this.requestor = { request: this.request.bind(this) };
        // Create insecure agent if SSL verification should be skipped
        if (config.insecure) {
            this.agent = new Agent({
                connect: {
                    rejectUnauthorized: false,
                    checkServerIdentity: () => undefined, // Skip hostname verification
                },
            });
        }
    }

    get session(): Session | null {
        return this.state.session;
    }

    // --- Private helpers ---

    private storeCookies(response: Response): void {
        const setCookieHeader = response.headers.get('set-cookie');
        if (!setCookieHeader) return;

        // Parse Set-Cookie header(s) - may be multiple cookies
        // Format: "name=value; Path=/; HttpOnly" or multiple separated
        const cookieStrings = setCookieHeader.split(/,(?=\s*\w+=)/);
        for (const cookieStr of cookieStrings) {
            const match = cookieStr.match(/^([^=]+)=([^;]*)/);
            if (match && match[1] && match[2]) {
                this.state.cookies.set(match[1].trim(), match[2].trim());
            }
        }
    }

    private buildCookieHeader(): string | null {
        if (this.state.cookies.size === 0) return null;
        return Array.from(this.state.cookies.entries())
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
    }

    // Core HTTP request function with CSRF token injection and automatic retry on 403 errors
    private async request(options: RequestOptions): AsyncResult<Response, Error> {
        const { method, path, params, headers: customHeaders, body } = options;
        const { config } = this.state;

        // Build headers with auth and CSRF token.
        debug(`Request ${method} ${path} - CSRF token in state: ${this.state.csrfToken?.substring(0, 20) || 'null'}...`);
        const headers = buildRequestHeaders(
            BASE_HEADERS,
            customHeaders,
            config.auth,
            this.state.csrfToken
        );
        debug(`CSRF header being sent: ${headers['x-csrf-token']?.substring(0, 20) || 'none'}...`);

        // Add stored cookies to request
        const cookieHeader = this.buildCookieHeader();
        if (cookieHeader) {
            headers['Cookie'] = cookieHeader;
            debug(`Cookies being sent: ${cookieHeader.substring(0, 50)}...`);
        }

        // Build URL with parameters.
        const urlParams = buildParams(params, config.client);
        const url = buildUrl(config.url, path, urlParams);

        // Build fetch options with timeout and optional insecure agent.
        const fetchOptions: RequestInit & { dispatcher?: Agent } = {
            method,
            headers,
            signal: AbortSignal.timeout(config.timeout ?? DEFAULT_TIMEOUT),
        };

        // Add insecure agent if configured
        if (this.agent) {
            fetchOptions.dispatcher = this.agent;
        }

        // Add request body if provided.
        if (body) {
            fetchOptions.body = body;
        }

        try {
            // Execute HTTP request.
            debug(`Fetching URL: ${url}`);
            debug(`Insecure mode: ${!!this.agent}`);
            // Use undici fetch directly to support dispatcher option for SSL bypass
            const response = await undiciFetch(url, fetchOptions as Parameters<typeof undiciFetch>[1]) as unknown as Response;

            // Store any cookies from response
            this.storeCookies(response);

            // Handle CSRF token validation failure with automatic refresh.
            if (response.status === 403) {
                const text = await response.text();
                if (text.includes('CSRF token validation failed')) {
                    // Fetch new CSRF token.
                    const [newToken, tokenErr] = await sessionOps.fetchCsrfToken(this.state, this.request.bind(this));
                    if (tokenErr) {
                        return err(new Error(`CSRF token refresh failed: ${tokenErr.message}`));
                    }

                    // Retry request with new token and cookies.
                    headers[CSRF_TOKEN_HEADER] = newToken;
                    const retryCookieHeader = this.buildCookieHeader();
                    if (retryCookieHeader) {
                        headers['Cookie'] = retryCookieHeader;
                    }
                    debug(`Retrying with new CSRF token: ${newToken.substring(0, 20)}...`);
                    const retryResponse = await undiciFetch(url, { ...fetchOptions, headers } as Parameters<typeof undiciFetch>[1]) as unknown as Response;
                    this.storeCookies(retryResponse);
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
                const [, resetErr] = await sessionOps.sessionReset(this.state, this.request.bind(this));
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
            // Log detailed error info for debugging
            if (error instanceof Error) {
                debugError(`Fetch error: ${error.name}: ${error.message}`, error.cause);
                if ('code' in error) {
                    debugError(`Error code: ${(error as NodeJS.ErrnoException).code}`);
                }
                return err(error);
            }
            return err(new Error(`Network error: ${String(error)}`));
        }
    }

    // --- Lifecycle ---

    async login(): AsyncResult<Session> {
        const { authStrategy } = this.state;

        // For SSO and SAML, perform initial authentication (certificate enrollment or browser login)
        if (authStrategy.performLogin) {
            const [, loginErr] = await authStrategy.performLogin(fetch);
            if (loginErr) {
                return err(loginErr);
            }
        }

        // For SSO with mTLS, create agent with client certificates
        if (authStrategy.type === 'sso' && authStrategy.getCertificates) {
            const certs = authStrategy.getCertificates();
            if (certs) {
                this.agent = new Agent({
                    connect: {
                        cert: certs.fullChain,
                        key: certs.privateKey,
                        rejectUnauthorized: !this.state.config.insecure,
                        ...(this.state.config.insecure && {
                            checkServerIdentity: () => undefined,
                        }),
                    },
                });
                debug('Created mTLS agent with SSO certificates');
            }
        }

        return sessionOps.login(this.state, this.request.bind(this));
    }

    async logout(): AsyncResult<void> {
        return sessionOps.logout(this.state, this.request.bind(this));
    }

    // --- CRAUD Operations ---

    async read(objects: ObjectRef[]): AsyncResult<ObjectWithContent[]> {
        if (!this.state.session) return err(new Error('Not logged in'));

        const results: ObjectWithContent[] = [];
        for (const obj of objects) {
            const [result, readErr] = await adt.readObject(this.requestor, obj);
            if (readErr) return err(readErr);
            results.push(result);
        }
        return ok(results);
    }

    async create(object: ObjectContent, packageName: string, transport?: string): AsyncResult<void> {
        if (!this.state.session) return err(new Error('Not logged in'));

        // Step 1: Create empty object shell
        const [, createErr] = await adt.createObject(this.requestor, object, packageName, transport, this.state.session.username);
        if (createErr) return err(createErr);

        // Step 2: Populate content via lock → update → unlock
        const objRef: ObjectRef = { name: object.name, extension: object.extension };

        const [lockHandle, lockErr] = await adt.lockObject(this.requestor, objRef);
        if (lockErr) return err(lockErr);

        const [, updateErr] = await adt.updateObject(this.requestor, object, lockHandle, transport);

        // Always unlock after update attempt
        const [, unlockErr] = await adt.unlockObject(this.requestor, objRef, lockHandle);

        if (updateErr) return err(updateErr);
        if (unlockErr) return err(unlockErr);

        return ok(undefined);
    }

    async update(object: ObjectContent, transport?: string): AsyncResult<void> {
        if (!this.state.session) return err(new Error('Not logged in'));

        const objRef: ObjectRef = { name: object.name, extension: object.extension };

        // Lock object before update
        const [lockHandle, lockErr] = await adt.lockObject(this.requestor, objRef);
        if (lockErr) return err(lockErr);

        // Update object content
        const [, updateErr] = await adt.updateObject(this.requestor, object, lockHandle, transport);

        // Always unlock after update attempt
        const [, unlockErr] = await adt.unlockObject(this.requestor, objRef, lockHandle);

        // Return first error encountered
        if (updateErr) return err(updateErr);
        if (unlockErr) return err(unlockErr);

        return ok(undefined);
    }

    async upsert(objects: ObjectContent[], packageName: string, transport?: string): AsyncResult<UpsertResult[]> {
        if (!this.state.session) return err(new Error('Not logged in'));
        if (objects.length === 0) return ok([]);

        const results: UpsertResult[] = [];
        for (const obj of objects) {
            if (!obj.name || !obj.extension) continue;

            const objRef: ObjectRef = { name: obj.name, extension: obj.extension };

            // Try to read existing object
            const [existing] = await adt.readObject(this.requestor, objRef);

            // Object doesn't exist - create it
            if (!existing) {
                const [, createErr] = await this.create(obj, packageName, transport);
                if (createErr) return err(createErr);

                const result: UpsertResult = {
                    name: obj.name,
                    extension: obj.extension,
                    status: 'created',
                };
                if (transport) result.transport = transport;
                results.push(result);
                continue;
            }

            // Object exists - update it
            const [, updateErr] = await this.update(obj, transport);
            if (updateErr) return err(updateErr);

            const result: UpsertResult = {
                name: obj.name,
                extension: obj.extension,
                status: 'updated',
            };
            if (transport) result.transport = transport;
            results.push(result);
        }
        return ok(results);
    }

    async activate(objects: ObjectRef[]): AsyncResult<ActivationResult[]> {
        if (!this.state.session) return err(new Error('Not logged in'));
        return adt.activateObjects(this.requestor, objects);
    }

    async delete(objects: ObjectRef[], transport?: string): AsyncResult<void> {
        if (!this.state.session) return err(new Error('Not logged in'));

        for (const obj of objects) {
            // Lock object before deletion
            const [lockHandle, lockErr] = await adt.lockObject(this.requestor, obj);
            if (lockErr) return err(lockErr);

            // Delete object
            const [, deleteErr] = await adt.deleteObject(this.requestor, obj, lockHandle, transport);
            if (deleteErr) {
                // Attempt to unlock on failure
                await adt.unlockObject(this.requestor, obj, lockHandle);
                return err(deleteErr);
            }
        }
        return ok(undefined);
    }

    // --- Discovery ---

    async getPackages(): AsyncResult<Package[]> {
        if (!this.state.session) return err(new Error('Not logged in'));
        return adt.getPackages(this.requestor);
    }

    async getTree(query: TreeQuery): AsyncResult<TreeNode[]> {
        if (!this.state.session) return err(new Error('Not logged in'));
        return adt.getTree(this.requestor, query);
    }

    async getTransports(packageName: string): AsyncResult<Transport[]> {
        if (!this.state.session) return err(new Error('Not logged in'));
        return adt.getTransports(this.requestor, packageName);
    }

    // --- Data Preview ---

    async previewData(query: PreviewSQL): AsyncResult<DataFrame> {
        if (!this.state.session) return err(new Error('Not logged in'));
        return adt.previewData(this.requestor, query);
    }

    async getDistinctValues(objectName: string, parameters: Parameter[], column: string, objectType: 'table' | 'view' = 'view'): AsyncResult<DistinctResult> {
        if (!this.state.session) return err(new Error('Not logged in'));
        return adt.getDistinctValues(this.requestor, objectName, parameters, column, objectType);
    }

    async countRows(objectName: string, objectType: 'table' | 'view'): AsyncResult<number> {
        if (!this.state.session) return err(new Error('Not logged in'));
        return adt.countRows(this.requestor, objectName, objectType);
    }

    // --- Search ---

    async search(query: string, types?: string[]): AsyncResult<SearchResult[]> {
        if (!this.state.session) return err(new Error('Not logged in'));
        return adt.searchObjects(this.requestor, query, types);
    }

    async whereUsed(object: ObjectRef): AsyncResult<Dependency[]> {
        if (!this.state.session) return err(new Error('Not logged in'));
        return adt.findWhereUsed(this.requestor, object);
    }

    // --- Transport Management ---

    async createTransport(transportConfig: TransportConfig): AsyncResult<string> {
        if (!this.state.session) return err(new Error('Not logged in'));
        return adt.createTransport(this.requestor, transportConfig);
    }

    // --- Diff Operations ---

    async gitDiff(objects: ObjectContent[]): AsyncResult<DiffResult[]> {
        if (!this.state.session) return err(new Error('Not logged in'));
        if (objects.length === 0) return ok([]);

        const results: DiffResult[] = [];
        for (const obj of objects) {
            const [result, diffErr] = await adt.gitDiff(this.requestor, obj);
            if (diffErr) return err(diffErr);
            results.push(result);
        }
        return ok(results);
    }

    // --- Configuration ---

    getObjectConfig(): ObjectConfig[] {
        return Object.values(adt.OBJECT_CONFIG_MAP);
    }
}

// Create a new ADT client - validates config and returns client instance
export function createClient(config: ClientConfig): Result<ADTClient, Error> {
    // Validate config using Zod schema.
    const validation = clientConfigSchema.safeParse(config);
    if (!validation.success) {
        const issues = validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        return err(new Error(`Invalid client configuration: ${issues}`));
    }

    return ok(new ADTClientImpl(config));
}
