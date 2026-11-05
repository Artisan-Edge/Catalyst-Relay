/**
 * ADT Operations Module
 *
 * Low-level operations for SAP ADT:
 * - CRAUD: Create, Read, Activate, Update, Delete
 * - Discovery: Packages, tree browsing, transports
 * - Data preview: Table/view queries
 * - Search: Object search, where-used analysis
 *
 * One function per file pattern.
 */

// Types and configuration (shared across module)
export type { AdtRequestor, ObjectConfig, ConfiguredExtension, UpsertResult, ObjectKind, ContainerConfig, SourceFormat, LockTarget } from './types';
export {
    OBJECT_CONFIG_MAP,
    FUNCTION_GROUP_CONFIG,
    SOURCE_FORMAT_MEDIA_TYPES,
    ObjectTypeLabel,
    getConfigByExtension,
    getConfigByType,
    getAllExtensions,
    getAllTypes,
    isExtensionSupported,
} from './types';

// Read operations
export { readObject } from './craud/read';
export type { ObjectMetadata, ObjectWithContent } from './craud/read';

// Activation
export type { ActivationResult, ActivationMessage, ActivationReference } from './craud/activation';

// Multi-delete
export type { DeleteResult, ExternalReference } from './craud/multiDelete';
export { ExternalReferencesError, multiDeleteObjects } from './craud/multiDelete';

// Syntax Check
export type { CheckResult } from './craud/syntaxCheck';

// Discovery types
export type { TreeResponse, PackageNode, FolderNode, ObjectNode, UnsupportedObjectNode } from './discovery/tree';
export type { Package, GetPackagesOptions } from './discovery/packages';
export type { Transport } from './transports/transports';

// Preview types
export type { DataFrame, ColumnInfo } from './data_extraction/previewParser';
export type { DistinctResult } from './data_extraction/distinct';

// Inactive objects types
export type { InactiveEntry, InactiveObject, InactiveTransport, InactiveRef } from './discovery/inactiveObjects';

// Search types
export type { SearchResult, SearchOptions } from './discovery/searchObjects';
export type { Dependency } from './discovery/whereUsed';

// Lock management
export { lockObject, unlockObject, acquireLock, releaseLock } from './craud/lock';
export { withLock } from './craud/withLock';
export { objectLockTarget } from './helpers';

// Function groups and containers (function modules, function group includes)
export {
    containerFromUri,
    containerFromIncludeName,
    groupFromUri,
    groupFromMainProgramName,
    isGeneratedInclude,
    isFunctionGroup,
    isFunctionGroupInclude,
    ensureFunctionGroup,
    prepareFunctionGroups,
    withFunctionGroupParts,
    FUNCTION_GROUP_UPSERT_ORDER,
    refuseGeneratedInclude,
    withIncludeHint,
    splitGroupParts,
    isOwnGroupReference,
    owningGroupInSet,
    rollUpGroupParts,
    oneAtATimePerGroup,
} from './functionGroup';
export { resolveContainers } from './craud/resolveContainers';
export { getFunctionGroupParts } from './discovery/functionGroupParts';
export type { FunctionGroupParts, FunctionGroupPart } from './discovery/functionGroupParts';

// Object attributes (title, program authorization group)
export { readObjectAttributes, writeObjectAttributes, ATTRIBUTE_EXTENSIONS } from './attributes';
export type { ObjectAttributes, ObjectAttributesInfo, ObjectAttributesWriteResult } from './attributes';

// Content comparison (form objects semantically, AFF JSON as values, DDIC DDL ignoring re-layout, other sources line by line)
export { contentEquivalent } from './craud/contentEquivalent';
export { affJsonDescription, affJsonEquivalent } from './aff';

// Write operations
export { createObject } from './craud/create';
export { updateObject } from './craud/update';
export { readClassInclude, updateClassInclude, classIncludeExists, createClassInclude } from './craud/classInclude';
export type { ClassIncludeType } from './craud/classInclude';
export { deleteObject } from './craud/delete';

// Activation
export { activateObjects, activateByReferences } from './craud/activation';

// API release (CDS / DDLS C1 contract)
export { getApiReleaseState } from './craud/apirelease/getState';
export { releaseApi, unreleaseApi } from './craud/apirelease/release';
export { updateApiReleaseVisibility } from './craud/apirelease/visibility';
export type { ApiReleaseVisibilityOptions } from './craud/apirelease/visibility';
export type { ApiReleaseState, ApiReleaseResult, ApiReleaseStatus, ApiReleaseValidationMessage, ApiReleaseVisibility, ApiReleaseVisibilityResult } from './craud/apirelease/types';

// Syntax Check
export { checkSyntax } from './craud/syntaxCheck';

// Refactoring
export { changePackage } from './refactoring/changePackage';
export { MOVE_ONLY_EXTENSIONS } from './refactoring/moveTargets';
export type { ChangePackageResult, ChangePackageStatus, ChangePackageOptions } from './refactoring/changePackage';

// Discovery operations
export { getPackages } from './discovery/packages';
export { getTree } from './discovery/tree';
export { getPackageStats } from './discovery/tree/packageStats';
export { getTransports } from './transports/transports';
export { getUserTransports } from './transports/getUserTransports';
export type { UserTransport, UserTransportFilters, TransportStatus } from './transports/getUserTransports';

// Inactive objects
export { getInactiveObjects } from './discovery/inactiveObjects';

// Data preview operations
export { previewData } from './data_extraction/dataPreview';
export { freestyleQuery } from './data_extraction/freestyle';
export { getDistinctValues } from './data_extraction/distinct';
export { countRows } from './data_extraction/count';

// Query builder (optional helper)
export { buildSQLQuery, queryFiltersToWhere, sortingsToOrderBy, fieldsToGroupbyClause } from './data_extraction/queryBuilder';
export type { DataPreviewQuery, QueryFilter, BasicFilter, BetweenFilter, ListFilter, Sorting, Aggregation, Parameter } from './data_extraction/queryBuilder';

// Search operations
export { searchObjects } from './discovery/searchObjects';
export { findWhereUsed } from './discovery/whereUsed';

// Transport management
export { createTransport } from './transports/createTransport';
export type { TransportConfig, TransportType } from './transports/createTransport';
export { getTransportTargets } from './transports/getTransportTargets';
export type { TransportTarget } from './transports/getTransportTargets';
export { deleteTransport } from './transports/deleteTransport';
export { removeFromTransport } from './transports/removeFromTransport';
export type { TransportObject } from './transports/removeFromTransport';
export { getTransportContents } from './transports/getTransportContents';
export { viewTransportObjects } from './transports/viewTransportObjects';
export type { TaskContents } from './transports/parseTransportTasks';

// Diff operations
export { gitDiff } from './craud/gitDiff';
export type { DiffResult, DiffHunk, SimpleDiffHunk, ModifiedDiffHunk } from './craud/gitDiff';

// Business services (service bindings)
export { validateServiceBinding } from './businessservices/validate';
export { createServiceBindingObject } from './businessservices/create';
export { activateServiceBinding } from './businessservices/activate';
export { publishServiceBinding, unpublishServiceBinding } from './businessservices/publish';
export { deleteServiceBinding } from './businessservices/delete';
export { readServiceBinding, parseServiceBinding } from './businessservices/read';
export type {
    CreateServiceBindingOptions,
    ServiceBindingResult,
    ServiceBindingType,
    ServiceBindingVersion,
    ServiceBindingCategory,
    ServiceBindingInfo,
    ServiceBindingSteps,
    ServiceBindingStepStatus,
} from './businessservices/types';

// Cloud IAM (IAM apps, business catalogs)
export { createIamAppObject, readIamApp, parseIamApp, addIamAppServices, appendServices, publishIamApp } from './iam/app';
export {
    createBusinessCatalogObject,
    readBusinessCatalog,
    parseBusinessCatalog,
    readCatalogAssignments,
    createCatalogAssignment,
    nextAssignmentName,
    publishBusinessCatalog,
} from './iam/catalog';
export type {
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
} from './iam/types';

// Packages
export { createPackage, readPackageSettings, parsePackageSettings } from './packages/createPackage';
export type { CreatePackageOptions, CreatePackageResult, PackageSettings } from './packages/createPackage';

// Text elements (text symbols, selection texts, list headings)
export { readTextElements } from './textelements/readTextElements';
export { writeTextElements } from './textelements/writeTextElements';
export type { TextElementsWriteResult } from './textelements/writeTextElements';
export { resolveTextElementsOwner } from './textelements/resolveTextElementsOwner';
export { activateTextElements, textElementsReference } from './textelements/activateTextElements';
export { parseTextElements } from './textelements/parseTextElements';
export { serializeTextElements, canonicalTextElements, textElementsEquivalent } from './textelements/serializeTextElements';
export { validateTextElements } from './textelements/validateTextElements';
export { TEXT_ELEMENTS_KINDS, TEXT_ELEMENTS_EXTENSION } from './textelements/types';
export type { TextElementsOwner, TextElementsOwnerKind, TextElementsPart, TextElementsParts, TextElementEntry } from './textelements/types';

// ABAP Unit
export { runUnitTests } from './abapunit/runUnitTests';
export { getUnitTestMetadata } from './abapunit/getUnitTestMetadata';
export { UNIT_TEST_RISK_LEVELS, UNIT_TEST_DURATIONS, DEFAULT_UNIT_TEST_RISK_LEVELS, DEFAULT_UNIT_TEST_DURATIONS } from './abapunit/types';
export type { UnitTestMetadata } from './abapunit/getUnitTestMetadata';
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
} from './abapunit/types';
