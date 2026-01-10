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
export type { ActivationResult, ActivationMessage } from './craud/activation';

// Discovery types
export type { TreeResponse, PackageNode, FolderNode, ObjectNode, TreeNode, Package } from './discovery/tree';
export type { Transport } from './transports/transports';

// Preview types
export type { DataFrame, ColumnInfo } from './data_extraction/previewParser';
export type { DistinctResult } from './data_extraction/distinct';

// Search types
export type { SearchResult } from './discovery/searchObjects';
export type { Dependency } from './discovery/whereUsed';

// Lock management
export { lockObject, unlockObject } from './craud/lock';

// Write operations
export { createObject } from './craud/create';
export { updateObject } from './craud/update';
export { deleteObject } from './craud/delete';

// Activation
export { activateObjects } from './craud/activation';

// Discovery operations
export { getPackages } from './discovery/packages';
export { getTree } from './discovery/tree';
export { getTransports } from './transports/transports';

// Data preview operations
export { previewData } from './data_extraction/dataPreview';
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
export type { TransportConfig } from './transports/createTransport';

// Diff operations
export { gitDiff } from './craud/gitDiff';
export type { DiffResult, DiffHunk, SimpleDiffHunk, ModifiedDiffHunk } from './craud/gitDiff';
