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

// Logging control
export { activateLogging, deactivateLogging } from './core';

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
    PreviewSQL,
} from './types/requests';

// Behavior definition implementation type (runtime enum)
export { BehaviorImplementationType } from './types/requests';

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
export type { Session, ExportableSessionState } from './core/session/types';

// ADT domain types
export type {
    ObjectMetadata,
    ObjectWithContent,
    UpsertResult,
    ActivationResult,
    ActivationMessage,
    ActivationReference,
    CreateServiceBindingOptions,
    ServiceBindingResult,
    ServiceBindingType,
    ServiceBindingVersion,
    ServiceBindingCategory,
    ServiceBindingInfo,
    ServiceBindingSteps,
    ServiceBindingStepStatus,
    IamServiceType,
    IamServiceRef,
    IamAppService,
    IamAppInfo,
    IamPublishStatus,
    CreateIamAppOptions,
    IamStepStatus,
    IamAppResult,
    CatalogAppAssignment,
    BusinessCatalogInfo,
    CreateBusinessCatalogOptions,
    BusinessCatalogResult,
    CreatePackageOptions,
    CreatePackageResult,
    PackageSettings,
    ApiReleaseState,
    ApiReleaseResult,
    ApiReleaseStatus,
    ApiReleaseValidationMessage,
    ApiReleaseVisibility,
    ApiReleaseVisibilityOptions,
    ApiReleaseVisibilityResult,
    ChangePackageResult,
    ChangePackageStatus,
    ChangePackageOptions,
    CheckResult,
    ClassIncludeType,
    DeleteResult,
    ExternalReference,
    Transport,
    UserTransport,
    UserTransportFilters,
    TransportStatus,
    Package,
    GetPackagesOptions,
    DataFrame,
    ColumnInfo,
    DistinctResult,
    SearchResult,
    SearchOptions,
    Dependency,
    DiffResult,
    DiffHunk,
    SimpleDiffHunk,
    ModifiedDiffHunk,
    TransportConfig,
    TransportType,
    TransportObject,
    TaskContents,
    ObjectConfig,
    InactiveEntry,
    InactiveObject,
    InactiveTransport,
    InactiveRef,
    FunctionGroupParts,
    FunctionGroupPart,
    ObjectAttributes,
    ObjectAttributesInfo,
    ObjectAttributesWriteResult,
    // Tree types
    TreeResponse,
    PackageNode,
    FolderNode,
    ObjectNode,
    UnsupportedObjectNode,
} from './core/adt';

// Error classes (for instanceof checks on AsyncResult errors)
export { ExternalReferencesError } from './core/adt';

// Query builder (optional helper for data preview)
export { buildSQLQuery } from './core/adt';
export type { DataPreviewQuery, QueryFilter, BasicFilter, BetweenFilter, ListFilter, Sorting, Aggregation, Parameter } from './core/adt';

// Extensions only `changePackage` accepts (not readable/writable/deletable)
export { MOVE_ONLY_EXTENSIONS } from './core/adt';

// Object types with a title/attributes in their metadata document
export { ATTRIBUTE_EXTENSIONS } from './core/adt';

// Object type registry (extension ↔ ADT type); ObjectConfig.hasAttributes / sourceFormat / kind / cdsSource describe each type
export { OBJECT_CONFIG_MAP, getConfigByExtension, getConfigByType } from './core/adt';
export type { ConfiguredExtension, SourceFormat } from './core/adt';

// Function group rules (no HTTP): include name → group, generated includes, URIs
export { containerFromIncludeName, containerFromUri, groupFromUri, isGeneratedInclude } from './core/adt';

// Local vs server source comparison, as upsert decides "unchanged" (no HTTP)
export { contentEquivalent } from './core/adt';

// UTF-8 byte order mark helper used for every source parse
export { stripBom } from './core/utils';

// Message class (.asmsag) source helpers (pure; no HTTP)
export { parseMessageClass, validateMessageClass, serializeMessageClass, messageClassesEquivalent } from './core/msag';

// Lock objects (.asenqu)
export { parseLockObject, serializeLockObject, validateLockObject, lockObjectsEquivalent, LOCK_MODES } from './core/enqu';
export type { LockObjectDef, LockTableDef, LockParameterDef, LockMode } from './core/enqu';
export type { MessageClassDef, MessageDef } from './core/msag';

// Text elements (types + pure format helpers; client methods do the HTTP)
export { parseTextElements, serializeTextElements, canonicalTextElements, textElementsEquivalent, validateTextElements, textElementsReference, TEXT_ELEMENTS_KINDS, TEXT_ELEMENTS_EXTENSION } from './core/adt';
export type { TextElementsOwner, TextElementsOwnerKind, TextElementsPart, TextElementsParts, TextElementEntry, TextElementsWriteResult } from './core/adt';

// ABAP Unit
export { UNIT_TEST_RISK_LEVELS, UNIT_TEST_DURATIONS, DEFAULT_UNIT_TEST_RISK_LEVELS, DEFAULT_UNIT_TEST_DURATIONS } from './core/adt';
export type {
    UnitTestRunOptions,
    UnitTestRunResult,
    UnitTestSummary,
    UnitTestProgram,
    UnitTestClass,
    UnitTestMethod,
    UnitTestMethodStatus,
    UnitTestAlert,
    UnitTestAlertKind,
    UnitTestStackEntry,
    UnitTestRiskLevel,
    UnitTestDuration,
    UnitTestMetadata,
} from './core/adt';

// Result utilities
export { ok, err } from './types/result';
