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
export type { AdtRequestor, ObjectConfig, ConfiguredExtension, UpsertResult } from './types';
export {
    OBJECT_CONFIG_MAP,
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
export type { TreeResponse, PackageNode, FolderNode, ObjectNode } from './discovery/tree';
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
export { lockObject, unlockObject } from './craud/lock';

// Write operations
export { createObject } from './craud/create';
export { updateObject } from './craud/update';
export { readClassInclude, updateClassInclude } from './craud/classInclude';
export type { ClassIncludeType } from './craud/classInclude';
export { deleteObject } from './craud/delete';

// Activation
export { activateObjects, activateByReferences } from './craud/activation';

// Syntax Check
export { checkSyntax } from './craud/syntaxCheck';

// Discovery operations
export { getPackages } from './discovery/packages';
export { getTree } from './discovery/tree';
export { getPackageStats } from './discovery/tree/packageStats';
export { getTransports } from './transports/transports';

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
export type {
    CreateServiceBindingOptions,
    ServiceBindingResult,
    ServiceBindingType,
    ServiceBindingVersion,
} from './businessservices/types';
