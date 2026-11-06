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
    CheckResult,
    TreeResponse,
    PackageNode,
    Transport,
    UserTransport,
    UserTransportFilters,
    Package,
    GetPackagesOptions,
    DataFrame,
    DistinctResult,
    SearchResult,
    SearchOptions,
    Dependency,
    TransportConfig,
    TaskContents,
    DiffResult,
    ObjectConfig,
    Parameter,
    AdtRequestor,
    InactiveEntry,
    FunctionGroupParts,
    ObjectAttributes,
    ObjectAttributesInfo,
    ObjectAttributesWriteResult,
    DeleteResult,
    ClassIncludeType,
    CreateServiceBindingOptions,
    ServiceBindingResult,
    ServiceBindingVersion,
    ServiceBindingInfo,
    CreateIamAppOptions,
    IamAppResult,
    IamAppInfo,
    CreateBusinessCatalogOptions,
    BusinessCatalogResult,
    BusinessCatalogInfo,
    CreateRoleTemplateOptions,
    RoleTemplateResult,
    RoleTemplateInfo,
    IamPublishOptions,
    IamPublishError,
    IamObjectKind,
    IamBindingUsageScan,
    FindIamAppsUsingBindingsOptions,
    DeletionCheckResult,
    DeletionResult,
    CreatePackageOptions,
    CreatePackageResult,
    ApiReleaseState,
    ApiReleaseResult,
    ApiReleaseVisibility,
    ApiReleaseVisibilityOptions,
    ApiReleaseVisibilityResult,
    ChangePackageResult,
    ChangePackageOptions,
    TextElementsOwner,
    TextElementsPart,
    TextElementsParts,
    TextElementsWriteResult,
    UnitTestRunOptions,
    UnitTestRunResult,
    UnitTestMetadata,
    MdaAppOptions,
    MdaAppValidation,
    MdaAppPreview,
    MdaGenerateResult,
    RunClassOptions,
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
import * as businessServiceMethods from './methods/craud/specialcases/businessservices';
import * as iamMethods from './methods/iam';
import * as deletionMethods from './methods/deletion';
import * as packageMethods from './methods/packages';
import * as apiReleaseMethods from './methods/apirelease';
import * as refactoringMethods from './methods/refactoring';
import * as textElementMethods from './methods/textelements';
import * as abapUnitMethods from './methods/abapunit';
import * as attributeMethods from './methods/attributes';
import * as generatorMethods from './methods/generators';
import * as classRunMethods from './methods/classrun';
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
    readClassInclude(className: string, includeType: ClassIncludeType): AsyncResult<string>;
    writeClassInclude(className: string, includeType: ClassIncludeType, source: string, transport?: string): AsyncResult<void>;
    upsert(objects: ObjectContent[], packageName: string, transport?: string): AsyncResult<UpsertResult[]>;
    activate(objects: ObjectRef[]): AsyncResult<ActivationResult[]>;
    checkSyntax(objects: ObjectRef[]): AsyncResult<CheckResult[]>;
    delete(objects: ObjectRef[], transport?: string): AsyncResult<DeleteResult[]>;

    // Refactoring
    changePackage(objects: ObjectRef[], targetPackage: string, options?: ChangePackageOptions): AsyncResult<ChangePackageResult[]>;

    // Discovery
    getPackages(options?: GetPackagesOptions): AsyncResult<Package[]>;
    getTree(query: TreeQuery): AsyncResult<TreeResponse>;
    getPackageStats(packageName: string): AsyncResult<PackageNode>;
    getPackageStats(packageNames: string[]): AsyncResult<PackageNode[]>;
    getTransports(packageName: string): AsyncResult<Transport[]>;
    getUserTransports(filters?: UserTransportFilters & { user?: string }): AsyncResult<UserTransport[]>;
    getInactiveObjects(): AsyncResult<InactiveEntry[]>;
    getFunctionGroupParts(group: string): AsyncResult<FunctionGroupParts>;

    // Object attributes: title and program authorization group (saved inactive; activate afterwards)
    readObjectAttributes(object: ObjectRef): AsyncResult<ObjectAttributesInfo>;
    writeObjectAttributes(object: ObjectRef, attributes: ObjectAttributes, transport?: string): AsyncResult<ObjectAttributesWriteResult>;

    // Data Preview
    previewData(query: PreviewSQL): AsyncResult<DataFrame>;
    getDistinctValues(objectName: string, parameters: Parameter[], column: string, objectType?: 'table' | 'view'): AsyncResult<DistinctResult>;
    countRows(objectName: string, objectType: 'table' | 'view', parameters?: Parameter[]): AsyncResult<number>;
    freestyleQuery(sqlQuery: string, limit?: number, timeout?: number): AsyncResult<DataFrame>;

    // Search
    search(query: string, options?: SearchOptions): AsyncResult<SearchResult[]>;
    whereUsed(object: ObjectRef): AsyncResult<Dependency[]>;

    // Transport Management
    createTransport(config: TransportConfig): AsyncResult<string>;
    deleteTransport(transportId: string, removeObjects?: boolean): AsyncResult<void>;
    removeFromTransport(transportId: string, objectName: string): AsyncResult<void>;
    viewTransportObjects(transportId: string): AsyncResult<TaskContents[]>;

    // Diff Operations
    gitDiff(objects: ObjectContent[]): AsyncResult<DiffResult[]>;

    // Business Services
    createServiceBinding(options: CreateServiceBindingOptions): AsyncResult<ServiceBindingResult>;
    deleteServiceBinding(bindingName: string, transport?: string, version?: ServiceBindingVersion): AsyncResult<void>;
    readServiceBinding(bindingName: string): AsyncResult<ServiceBindingInfo>;
    // (Re)activate a binding, e.g. after its service definition was widened; client.activate cannot address SRVB
    activateServiceBinding(bindingName: string): AsyncResult<ActivationResult[]>;

    // Cloud IAM
    createIamApp(options: CreateIamAppOptions): AsyncResult<IamAppResult>;
    readIamApp(appName: string): AsyncResult<IamAppInfo>;
    createBusinessCatalog(options: CreateBusinessCatalogOptions): AsyncResult<BusinessCatalogResult>;
    readBusinessCatalog(catalogName: string): AsyncResult<BusinessCatalogInfo>;
    createRoleTemplate(options: CreateRoleTemplateOptions): AsyncResult<RoleTemplateResult>;
    readRoleTemplate(templateName: string): AsyncResult<RoleTemplateInfo>;
    // Publish locally; each waits for SAP's synchronous ~2 min publish (re-posts on timeout / 'u')
    publishIamApp(appName: string, options?: IamPublishOptions): AsyncResult<string, IamPublishError>;
    publishBusinessCatalog(catalogName: string, options?: IamPublishOptions): AsyncResult<string, IamPublishError>;
    publishRoleTemplate(templateName: string, options?: IamPublishOptions): AsyncResult<string, IamPublishError>;
    deleteIamObject(kind: IamObjectKind, name: string, transport?: string): AsyncResult<void>;
    // IAM apps listing any of the bindings (reads each customer app once; appsScanned 0 means nothing was checked)
    findIamAppsUsingBindings(bindingNames: string[], options?: FindIamAppsUsingBindingsOptions): AsyncResult<IamBindingUsageScan>;

    // Generic deletion service (any type by URI; app variants, which cannot be locked)
    checkDeletion(uris: string[]): AsyncResult<DeletionCheckResult[]>;
    deleteByUri(uris: string[], transport?: string): AsyncResult<DeletionResult[]>;
    deleteAppVariant(name: string, transport?: string): AsyncResult<DeletionResult>;

    // MDA app generator (validate is the idempotence pre-check; generate skips a set that exists)
    validateMdaApp(options: MdaAppOptions): AsyncResult<MdaAppValidation>;
    previewMdaApp(options: MdaAppOptions): AsyncResult<MdaAppPreview>;
    generateMdaApp(options: MdaAppOptions): AsyncResult<MdaGenerateResult>;

    // Class run (IF_OO_ADT_CLASSRUN): stateless, returns the console text
    runClass(className: string, options?: RunClassOptions): AsyncResult<string>;

    // Packages
    createPackage(options: CreatePackageOptions): AsyncResult<CreatePackageResult>;

    // API Release (CDS / DDLS C1 contract)
    getApiReleaseState(objectName: string): AsyncResult<ApiReleaseState>;
    releaseApi(objectName: string, transport?: string, visibility?: ApiReleaseVisibility): AsyncResult<ApiReleaseResult>;
    unreleaseApi(objectName: string, transport?: string): AsyncResult<ApiReleaseResult>;
    updateApiReleaseVisibility(objectName: string, change: Partial<ApiReleaseVisibility>, options?: ApiReleaseVisibilityOptions): AsyncResult<ApiReleaseVisibilityResult>;

    // Text elements (text symbols, selection texts, list headings); writes stay inactive until activateTextElements
    readTextElements(owner: TextElementsOwner, parts?: readonly TextElementsPart[]): AsyncResult<TextElementsParts>;
    writeTextElements(owner: TextElementsOwner, parts: TextElementsParts, transport?: string): AsyncResult<TextElementsWriteResult>;
    resolveTextElementsOwner(name: string): AsyncResult<TextElementsOwner>;
    activateTextElements(owners: readonly TextElementsOwner[]): AsyncResult<ActivationResult[]>;

    // ABAP Unit
    runUnitTests(options: UnitTestRunOptions): AsyncResult<UnitTestRunResult>;
    getUnitTestMetadata(): AsyncResult<UnitTestMetadata>;

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

    private storeCookies(response: Response, skip?: (name: string) => boolean): void {
        storeCookies(this.state.cookies, response, skip);
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

    async readClassInclude(className: string, includeType: ClassIncludeType): AsyncResult<string> {
        return craudMethods.readClassInclude(this.state, this.requestor, className, includeType);
    }

    async writeClassInclude(className: string, includeType: ClassIncludeType, source: string, transport?: string): AsyncResult<void> {
        return craudMethods.writeClassInclude(this.state, this.requestor, className, includeType, source, transport);
    }

    async upsert(objects: ObjectContent[], packageName: string, transport?: string): AsyncResult<UpsertResult[]> {
        return craudMethods.upsert(this.state, this.requestor, objects, packageName, transport);
    }

    async activate(objects: ObjectRef[]): AsyncResult<ActivationResult[]> {
        return craudMethods.activate(this.state, this.requestor, objects);
    }

    async checkSyntax(objects: ObjectRef[]): AsyncResult<CheckResult[]> {
        return craudMethods.checkSyntax(this.state, this.requestor, objects);
    }

    async delete(objects: ObjectRef[], transport?: string): AsyncResult<DeleteResult[]> {
        return craudMethods.deleteObjects(this.state, this.requestor, objects, transport);
    }

    // --- Discovery ---

    async getPackages(options?: GetPackagesOptions): AsyncResult<Package[]> {
        return discoveryMethods.getPackages(this.state, this.requestor, options);
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

    async getUserTransports(filters?: UserTransportFilters & { user?: string }): AsyncResult<UserTransport[]> {
        return discoveryMethods.getUserTransports(this.state, this.requestor, filters);
    }

    async getInactiveObjects(): AsyncResult<InactiveEntry[]> {
        return discoveryMethods.getInactiveObjects(this.state, this.requestor);
    }

    async getFunctionGroupParts(group: string): AsyncResult<FunctionGroupParts> {
        return discoveryMethods.getFunctionGroupParts(this.state, this.requestor, group);
    }

    // --- Object Attributes ---

    async readObjectAttributes(object: ObjectRef): AsyncResult<ObjectAttributesInfo> {
        return attributeMethods.readObjectAttributes(this.state, this.requestor, object);
    }

    async writeObjectAttributes(object: ObjectRef, attributes: ObjectAttributes, transport?: string): AsyncResult<ObjectAttributesWriteResult> {
        return attributeMethods.writeObjectAttributes(this.state, this.requestor, object, attributes, transport);
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

    async freestyleQuery(sqlQuery: string, limit?: number, timeout?: number): AsyncResult<DataFrame> {
        return previewMethods.freestyleQuery(this.state, this.requestor, sqlQuery, limit, timeout);
    }

    // --- Search ---

    async search(query: string, options?: SearchOptions): AsyncResult<SearchResult[]> {
        return searchMethods.search(this.state, this.requestor, query, options);
    }

    async whereUsed(object: ObjectRef): AsyncResult<Dependency[]> {
        return searchMethods.whereUsed(this.state, this.requestor, object);
    }

    // --- Transport Management ---

    async createTransport(transportConfig: TransportConfig): AsyncResult<string> {
        return transportMethods.createTransport(this.state, this.requestor, transportConfig);
    }

    async deleteTransport(transportId: string, removeObjects = false): AsyncResult<void> {
        return transportMethods.deleteTransport(this.state, this.requestor, transportId, removeObjects);
    }

    async removeFromTransport(transportId: string, objectName: string): AsyncResult<void> {
        return transportMethods.removeFromTransport(this.state, this.requestor, transportId, objectName);
    }

    async viewTransportObjects(transportId: string): AsyncResult<TaskContents[]> {
        return transportMethods.viewTransportObjects(this.state, this.requestor, transportId);
    }

    // --- Diff Operations ---

    async gitDiff(objects: ObjectContent[]): AsyncResult<DiffResult[]> {
        return diffMethods.gitDiff(this.state, this.requestor, objects);
    }

    // --- Business Services ---

    async createServiceBinding(options: CreateServiceBindingOptions): AsyncResult<ServiceBindingResult> {
        return businessServiceMethods.createServiceBinding(this.state, this.requestor, options);
    }

    async deleteServiceBinding(bindingName: string, transport?: string, version?: ServiceBindingVersion): AsyncResult<void> {
        return businessServiceMethods.deleteServiceBinding(this.state, this.requestor, bindingName, transport, version);
    }

    async readServiceBinding(bindingName: string): AsyncResult<ServiceBindingInfo> {
        return businessServiceMethods.readServiceBinding(this.state, this.requestor, bindingName);
    }

    async activateServiceBinding(bindingName: string): AsyncResult<ActivationResult[]> {
        return businessServiceMethods.activateServiceBinding(this.state, this.requestor, bindingName);
    }

    // --- Cloud IAM ---

    async createIamApp(options: CreateIamAppOptions): AsyncResult<IamAppResult> {
        return iamMethods.createIamApp(this.state, this.requestor, options);
    }

    async readIamApp(appName: string): AsyncResult<IamAppInfo> {
        return iamMethods.readIamApp(this.state, this.requestor, appName);
    }

    async createBusinessCatalog(options: CreateBusinessCatalogOptions): AsyncResult<BusinessCatalogResult> {
        return iamMethods.createBusinessCatalog(this.state, this.requestor, options);
    }

    async readBusinessCatalog(catalogName: string): AsyncResult<BusinessCatalogInfo> {
        return iamMethods.readBusinessCatalog(this.state, this.requestor, catalogName);
    }

    async createRoleTemplate(options: CreateRoleTemplateOptions): AsyncResult<RoleTemplateResult> {
        return iamMethods.createRoleTemplate(this.state, this.requestor, options);
    }

    async readRoleTemplate(templateName: string): AsyncResult<RoleTemplateInfo> {
        return iamMethods.readRoleTemplate(this.state, this.requestor, templateName);
    }

    async publishIamApp(appName: string, options?: IamPublishOptions): AsyncResult<string, IamPublishError> {
        return iamMethods.publishIamApp(this.state, this.requestor, appName, options);
    }

    async publishBusinessCatalog(catalogName: string, options?: IamPublishOptions): AsyncResult<string, IamPublishError> {
        return iamMethods.publishBusinessCatalog(this.state, this.requestor, catalogName, options);
    }

    async publishRoleTemplate(templateName: string, options?: IamPublishOptions): AsyncResult<string, IamPublishError> {
        return iamMethods.publishRoleTemplate(this.state, this.requestor, templateName, options);
    }

    async deleteIamObject(kind: IamObjectKind, name: string, transport?: string): AsyncResult<void> {
        return iamMethods.deleteIamObject(this.state, this.requestor, kind, name, transport);
    }

    async findIamAppsUsingBindings(bindingNames: string[], options?: FindIamAppsUsingBindingsOptions): AsyncResult<IamBindingUsageScan> {
        return iamMethods.findIamAppsUsingBindings(this.state, this.requestor, bindingNames, options);
    }

    // --- Generic deletion service ---

    async checkDeletion(uris: string[]): AsyncResult<DeletionCheckResult[]> {
        return deletionMethods.checkDeletion(this.state, this.requestor, uris);
    }

    async deleteByUri(uris: string[], transport?: string): AsyncResult<DeletionResult[]> {
        return deletionMethods.deleteByUri(this.state, this.requestor, uris, transport);
    }

    async deleteAppVariant(name: string, transport?: string): AsyncResult<DeletionResult> {
        return deletionMethods.deleteAppVariant(this.state, this.requestor, name, transport);
    }

    // --- MDA app generator ---

    async validateMdaApp(options: MdaAppOptions): AsyncResult<MdaAppValidation> {
        return generatorMethods.validateMdaApp(this.state, this.requestor, options);
    }

    async previewMdaApp(options: MdaAppOptions): AsyncResult<MdaAppPreview> {
        return generatorMethods.previewMdaApp(this.state, this.requestor, options);
    }

    async generateMdaApp(options: MdaAppOptions): AsyncResult<MdaGenerateResult> {
        return generatorMethods.generateMdaApp(this.state, this.requestor, options);
    }

    // --- Class run ---

    async runClass(className: string, options?: RunClassOptions): AsyncResult<string> {
        return classRunMethods.runClass(this.state, this.requestor, className, options);
    }

    // --- Packages ---

    async createPackage(options: CreatePackageOptions): AsyncResult<CreatePackageResult> {
        return packageMethods.createPackage(this.state, this.requestor, options);
    }

    // --- API Release ---

    async getApiReleaseState(objectName: string): AsyncResult<ApiReleaseState> {
        return apiReleaseMethods.getApiReleaseState(this.state, this.requestor, objectName);
    }

    async releaseApi(objectName: string, transport?: string, visibility?: ApiReleaseVisibility): AsyncResult<ApiReleaseResult> {
        return apiReleaseMethods.releaseApi(this.state, this.requestor, objectName, transport, visibility);
    }

    async unreleaseApi(objectName: string, transport?: string): AsyncResult<ApiReleaseResult> {
        return apiReleaseMethods.unreleaseApi(this.state, this.requestor, objectName, transport);
    }

    async updateApiReleaseVisibility(objectName: string, change: Partial<ApiReleaseVisibility>, options?: ApiReleaseVisibilityOptions): AsyncResult<ApiReleaseVisibilityResult> {
        return apiReleaseMethods.updateApiReleaseVisibility(this.state, this.requestor, objectName, change, options);
    }

    // --- Refactoring ---

    async changePackage(objects: ObjectRef[], targetPackage: string, options?: ChangePackageOptions): AsyncResult<ChangePackageResult[]> {
        return refactoringMethods.changePackage(this.state, this.requestor, objects, targetPackage, options);
    }

    // --- Text Elements ---

    async readTextElements(owner: TextElementsOwner, parts?: readonly TextElementsPart[]): AsyncResult<TextElementsParts> {
        return textElementMethods.readTextElements(this.state, this.requestor, owner, parts);
    }

    async writeTextElements(owner: TextElementsOwner, parts: TextElementsParts, transport?: string): AsyncResult<TextElementsWriteResult> {
        return textElementMethods.writeTextElements(this.state, this.requestor, owner, parts, transport);
    }

    async resolveTextElementsOwner(name: string): AsyncResult<TextElementsOwner> {
        return textElementMethods.resolveTextElementsOwner(this.state, this.requestor, name);
    }

    async activateTextElements(owners: readonly TextElementsOwner[]): AsyncResult<ActivationResult[]> {
        return textElementMethods.activateTextElements(this.state, this.requestor, owners);
    }

    // --- ABAP Unit ---

    async runUnitTests(options: UnitTestRunOptions): AsyncResult<UnitTestRunResult> {
        return abapUnitMethods.runUnitTests(this.state, this.requestor, options);
    }

    async getUnitTestMetadata(): AsyncResult<UnitTestMetadata> {
        return abapUnitMethods.getUnitTestMetadata(this.state, this.requestor);
    }

    // --- Configuration ---

    getObjectConfig(): ObjectConfig[] {
        return configMethods.getObjectConfig();
    }
}
