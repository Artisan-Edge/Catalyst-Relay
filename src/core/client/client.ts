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

import type { ClientConfig } from '../../types/config';
import type {
    ObjectRef,
    ObjectContent,
    TreeQuery,
    PreviewSQL,
} from '../../types/requests';
import type { Session, ExportableSessionState } from '../session/types';
import type { RefreshResult } from '../session/refresh';
import type {
    ObjectWithContent,
    UpsertResult,
    ActivationResult,
    TreeResponse,
    PackageNode,
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
    AdtRequestor,
} from '../adt';
import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import {
    CSRF_TOKEN_HEADER,
    BASE_HEADERS,
    DEFAULT_TIMEOUT,
    buildRequestHeaders,
    debug,
    debugError,
} from '../utils';
import * as sessionOps from '../session';
import { createAuthStrategy } from '../auth/factory';
import type { ClientState, ClientContext, RequestOptions, SsoCerts } from './types';
import { httpRequest, buildParams, buildUrl } from './helpers';

// Import extracted methods
import * as lifecycleMethods from './methods/lifecycle';
import * as sessionMethods from './methods/session';
import * as craudMethods from './methods/craud';
import * as discoveryMethods from './methods/discovery';
import * as previewMethods from './methods/preview';
import * as searchMethods from './methods/search';
import * as transportMethods from './methods/transport';
import * as diffMethods from './methods/diff';
import * as configMethods from './methods/config';

// ADT Client interface - provides all operations for interacting with SAP ADT servers
export interface ADTClient {
    /** Current session info (null if not logged in) */
    readonly session: Session | null;

    // Lifecycle
    login(): AsyncResult<Session>;
    logout(): AsyncResult<void>;
    refreshSession(): AsyncResult<RefreshResult>;

    // Session state export/import (for session caching across processes)
    exportSessionState(): ExportableSessionState | null;
    importSessionState(state: ExportableSessionState): AsyncResult<boolean>;

    // CRAUD Operations
    read(objects: ObjectRef[]): AsyncResult<ObjectWithContent[]>;
    create(object: ObjectContent, packageName: string, transport?: string): AsyncResult<void>;
    update(object: ObjectContent, transport?: string): AsyncResult<void>;
    upsert(objects: ObjectContent[], packageName: string, transport?: string): AsyncResult<UpsertResult[]>;
    activate(objects: ObjectRef[]): AsyncResult<ActivationResult[]>;
    delete(objects: ObjectRef[], transport?: string): AsyncResult<void>;

    // Discovery
    getPackages(filter?: string): AsyncResult<Package[]>;
    getTree(query: TreeQuery): AsyncResult<TreeResponse>;
    getPackageStats(packageName: string): AsyncResult<PackageNode>;
    getPackageStats(packageNames: string[]): AsyncResult<PackageNode[]>;
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

/**
 * ADT Client implementation class.
 * Methods are defined on the prototype (not recreated per instance).
 */
export class ADTClientImpl implements ADTClient {
    private state: ClientState;
    private requestor: AdtRequestor;
    // Store SSO certificates for mTLS authentication
    private ssoCerts: SsoCerts | undefined;
    // Auto-refresh timer handle
    private refreshTimer: ReturnType<typeof setInterval> | null = null;

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

    private startAutoRefresh(intervalMs: number): void {
        this.stopAutoRefresh();
        this.refreshTimer = setInterval(async () => {
            if (!this.state.session) return;
            const [, refreshErr] = await this.refreshSession();
            if (refreshErr) {
                debug(`Auto-refresh failed: ${refreshErr.message}`);
            }
        }, intervalMs);
    }

    private stopAutoRefresh(): void {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    private getContext(): ClientContext {
        return {
            state: this.state,
            ssoCerts: this.ssoCerts,
            request: this.request.bind(this),
            buildCookieHeader: this.buildCookieHeader.bind(this),
            storeCookies: this.storeCookies.bind(this),
            startAutoRefresh: this.startAutoRefresh.bind(this),
            stopAutoRefresh: this.stopAutoRefresh.bind(this),
        };
    }

    private setSsoCerts(certs: SsoCerts): void {
        this.ssoCerts = certs;
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

            const response = await httpRequest(url, {
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

                    const retryResponse = await httpRequest(url, {
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
        return lifecycleMethods.login(this.getContext(), this.setSsoCerts.bind(this));
    }

    async logout(): AsyncResult<void> {
        return lifecycleMethods.logout(this.getContext());
    }

    async refreshSession(): AsyncResult<RefreshResult> {
        return lifecycleMethods.refreshSession(this.getContext());
    }

    // --- Session State Export/Import ---

    exportSessionState(): ExportableSessionState | null {
        return sessionMethods.exportSessionState(this.getContext(), this.ssoCerts);
    }

    async importSessionState(state: ExportableSessionState): AsyncResult<boolean> {
        return sessionMethods.importSessionState(this.getContext(), state, this.setSsoCerts.bind(this));
    }

    // --- CRAUD Operations ---

    async read(objects: ObjectRef[]): AsyncResult<ObjectWithContent[]> {
        return craudMethods.read(this.state, this.requestor, objects);
    }

    async create(object: ObjectContent, packageName: string, transport?: string): AsyncResult<void> {
        return craudMethods.create(this.state, this.requestor, object, packageName, transport);
    }

    async update(object: ObjectContent, transport?: string): AsyncResult<void> {
        return craudMethods.update(this.state, this.requestor, object, transport);
    }

    async upsert(objects: ObjectContent[], packageName: string, transport?: string): AsyncResult<UpsertResult[]> {
        return craudMethods.upsert(this.state, this.requestor, objects, packageName, transport);
    }

    async activate(objects: ObjectRef[]): AsyncResult<ActivationResult[]> {
        return craudMethods.activate(this.state, this.requestor, objects);
    }

    async delete(objects: ObjectRef[], transport?: string): AsyncResult<void> {
        return craudMethods.deleteObjects(this.state, this.requestor, objects, transport);
    }

    // --- Discovery ---

    async getPackages(filter?: string): AsyncResult<Package[]> {
        return discoveryMethods.getPackages(this.state, this.requestor, filter);
    }

    async getTree(query: TreeQuery): AsyncResult<TreeResponse> {
        return discoveryMethods.getTree(this.state, this.requestor, query);
    }

    async getPackageStats(packageName: string): AsyncResult<PackageNode>;
    async getPackageStats(packageNames: string[]): AsyncResult<PackageNode[]>;
    async getPackageStats(packageNames: string | string[]): AsyncResult<PackageNode | PackageNode[]> {
        return discoveryMethods.getPackageStats(this.state, this.requestor, packageNames as string & string[]);
    }

    async getTransports(packageName: string): AsyncResult<Transport[]> {
        return discoveryMethods.getTransports(this.state, this.requestor, packageName);
    }

    // --- Data Preview ---

    async previewData(query: PreviewSQL): AsyncResult<DataFrame> {
        return previewMethods.previewData(this.state, this.requestor, query);
    }

    async getDistinctValues(objectName: string, parameters: Parameter[], column: string, objectType: 'table' | 'view' = 'view'): AsyncResult<DistinctResult> {
        return previewMethods.getDistinctValues(this.state, this.requestor, objectName, parameters, column, objectType);
    }

    async countRows(objectName: string, objectType: 'table' | 'view'): AsyncResult<number> {
        return previewMethods.countRows(this.state, this.requestor, objectName, objectType);
    }

    // --- Search ---

    async search(query: string, types?: string[]): AsyncResult<SearchResult[]> {
        return searchMethods.search(this.state, this.requestor, query, types);
    }

    async whereUsed(object: ObjectRef): AsyncResult<Dependency[]> {
        return searchMethods.whereUsed(this.state, this.requestor, object);
    }

    // --- Transport Management ---

    async createTransport(transportConfig: TransportConfig): AsyncResult<string> {
        return transportMethods.createTransport(this.state, this.requestor, transportConfig);
    }

    // --- Diff Operations ---

    async gitDiff(objects: ObjectContent[]): AsyncResult<DiffResult[]> {
        return diffMethods.gitDiff(this.state, this.requestor, objects);
    }

    // --- Configuration ---

    getObjectConfig(): ObjectConfig[] {
        return configMethods.getObjectConfig();
    }
}
