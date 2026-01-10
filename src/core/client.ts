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
 * Uses Node.js https module for all HTTP requests (works reliably with mTLS).
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
import { ok, err, resolveAllAsync } from '../types/result';
import {
    CSRF_TOKEN_HEADER,
    BASE_HEADERS,
    DEFAULT_TIMEOUT,
    buildRequestHeaders,
    debug,
    debugError,
    normalizeContent,
} from './utils';
import { clientConfigSchema } from '../types/config';
import * as sessionOps from './session/login';
import * as adt from './adt';
import type { AuthStrategy } from './auth/types';
import { createAuthStrategy } from './auth/factory';
import * as https from 'https';

/**
 * Make HTTP request using Node.js https module.
 *
 * Why https module instead of undici/fetch:
 * - Undici doesn't work with mTLS client certificates (tested, fails with "unable to get local issuer certificate")
 * - Node.js https module works reliably with mTLS in all environments (Node.js, Electron, Bun)
 * - Simpler to maintain one implementation that works everywhere
 */
async function httpsRequest(
    url: string,
    options: {
        method: string;
        headers: Record<string, string>;
        body?: string | undefined;
        cert?: string | undefined;
        key?: string | undefined;
        rejectUnauthorized?: boolean | undefined;
        timeout?: number | undefined;
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
            cert: options.cert,
            key: options.key,
            rejectUnauthorized: options.rejectUnauthorized ?? true,
            timeout: options.timeout,
        }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf-8');
                // Convert to web Response
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
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

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
    getPackages(filter?: string): AsyncResult<Package[]>;
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
    // Store SSO certificates for mTLS authentication
    private ssoCerts: { cert: string; key: string } | undefined;

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

        try {
            // Execute HTTP request using Node.js https module
            debug(`Fetching URL: ${url}`);
            debug(`mTLS: ${!!this.ssoCerts}, insecure: ${config.insecure}`);

            const response = await httpsRequest(url, {
                method,
                headers,
                body,
                cert: this.ssoCerts?.cert,
                key: this.ssoCerts?.key,
                rejectUnauthorized: !config.insecure,
                timeout: config.timeout ?? DEFAULT_TIMEOUT,
            });

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

                    const retryResponse = await httpsRequest(url, {
                        method,
                        headers,
                        body,
                        cert: this.ssoCerts?.cert,
                        key: this.ssoCerts?.key,
                        rejectUnauthorized: !config.insecure,
                        timeout: config.timeout ?? DEFAULT_TIMEOUT,
                    });
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

        // For SAML, transfer cookies from auth strategy to client cookie store
        if (authStrategy.type === 'saml' && authStrategy.getCookies) {
            const cookies = authStrategy.getCookies();
            for (const cookie of cookies) {
                this.state.cookies.set(cookie.name, cookie.value);
            }
            debug(`Transferred ${cookies.length} SAML cookies to client`);
        }

        // For SSO with mTLS, store certificates for use in requests
        if (authStrategy.type === 'sso' && authStrategy.getCertificates) {
            const certs = authStrategy.getCertificates();
            if (certs) {
                this.ssoCerts = {
                    cert: certs.fullChain,
                    key: certs.privateKey,
                };
                debug('Stored mTLS certificates for SSO authentication');
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

    async upsertSingle(object: ObjectContent, packageName: string, transport?: string): AsyncResult<UpsertResult> {
        if (!this.state.session) return err(new Error('Not logged in'));

        // Try to read existing object
        const objRef: ObjectRef = { name: object.name, extension: object.extension };
        const [existing] = await adt.readObject(this.requestor, objRef);

        // Object doesn't exist - create it
        if (!existing) {
            const [, createErr] = await this.create(object, packageName, transport);
            if (createErr) return err(createErr);

            const result: UpsertResult = {
                name: object.name,
                extension: object.extension,
                status: 'created',
            };
            if (transport) result.transport = transport;
            return ok(result);
        }

        // Compare normalized content to avoid unnecessary updates
        const serverContent = normalizeContent(existing.content);
        const localContent = normalizeContent(object.content);

        if (serverContent === localContent) {
            const result: UpsertResult = {
                name: object.name,
                extension: object.extension,
                status: 'unchanged',
            };
            if (transport) result.transport = transport;
            return ok(result);
        }

        // Content differs - update it
        const [, updateErr] = await this.update(object, transport);
        if (updateErr) return err(updateErr);

        const result: UpsertResult = {
            name: object.name,
            extension: object.extension,
            status: 'updated',
        };
        if (transport) result.transport = transport;
        return ok(result);
    }

    async upsert(objects: ObjectContent[], packageName: string, transport?: string): AsyncResult<UpsertResult[]> {
        // Confirm we can execute this request.
        if (!this.state.session) return err(new Error('Not logged in'));
        if (objects.length === 0) return ok([]);

        // Dispatch all upserts in sync.
        const asyncResults: AsyncResult<UpsertResult>[] = [];
        for (const obj of objects) {
            if (!obj.name || !obj.extension) continue;
            asyncResults.push(this.upsertSingle(obj, packageName, transport));
        }

        // Await all responses.
        const [results, error] = await resolveAllAsync(asyncResults);
        if (error) return err(error)
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

    async getPackages(filter?: string): AsyncResult<Package[]> {
        if (!this.state.session) return err(new Error('Not logged in'));
        return adt.getPackages(this.requestor, filter);
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
