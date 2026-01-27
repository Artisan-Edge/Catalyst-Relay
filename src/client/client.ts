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
import type { Session, ExportableSessionState } from '../core/session/types';
import type { RefreshResult } from '../core/session/refresh';
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
} from '../core/adt';
import type { AsyncResult } from '../types/result';
import { createAuthStrategy } from '../core/auth/factory';
import type { ClientState, ClientContext, RequestOptions, SsoCerts } from './types';

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
import {
    storeCookies,
    buildCookieHeader,
    createAutoRefresh,
    executeRequest,
} from './methods/internal';
import type { AutoRefreshManager } from './methods/internal';

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
    countRows(objectName: string, objectType: 'table' | 'view', parameters?: Parameter[]): AsyncResult<number>;

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
 * Methods delegate to extracted functions in methods/ folder.
 */
export class ADTClientImpl implements ADTClient {
    private state: ClientState;
    private requestor: AdtRequestor;
    private ssoCerts: SsoCerts | undefined;
    private autoRefresh: AutoRefreshManager;

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

        // Initialize auto-refresh manager
        this.autoRefresh = createAutoRefresh(
            () => this.state.session,
            () => this.refreshSession()
        );
    }

    get session(): Session | null {
        return this.state.session;
    }

    // --- Private helpers (one-line delegations) ---

    private storeCookies(response: Response): void {
        storeCookies(this.state.cookies, response);
    }

    private buildCookieHeader(): string | null {
        return buildCookieHeader(this.state.cookies);
    }

    private startAutoRefresh(intervalMs: number): void {
        this.autoRefresh.start(intervalMs);
    }

    private stopAutoRefresh(): void {
        this.autoRefresh.stop();
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

    private async request(options: RequestOptions): AsyncResult<Response, Error> {
        return executeRequest(
            {
                state: this.state,
                ssoCerts: this.ssoCerts,
                getCookieHeader: this.buildCookieHeader.bind(this),
                storeCookies: this.storeCookies.bind(this),
            },
            options,
            this.request.bind(this)
        );
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

    async countRows(objectName: string, objectType: 'table' | 'view', parameters: Parameter[] = []): AsyncResult<number> {
        return previewMethods.countRows(this.state, this.requestor, objectName, objectType, parameters);
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
