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
export { readObject } from './read';
export type { ObjectMetadata, ObjectWithContent } from './read';

// Activation
export type { ActivationResult, ActivationMessage } from './activation';

// Discovery types
export type { TreeNode, Package } from './tree';
export type { Transport } from './transports';

// Preview types
export type { DataFrame, ColumnInfo } from './previewParser';
export type { DistinctResult } from './distinct';

// Search types
export type { SearchResult } from './searchObjects';
export type { Dependency } from './whereUsed';

// Lock management
export { lockObject, unlockObject } from './lock';

// Write operations
export { createObject } from './create';
export { updateObject } from './update';
export { deleteObject } from './delete';

// Activation
export { activateObjects } from './activation';

// Discovery operations
export { getPackages } from './packages';
export { getTree } from './tree';
export { getTransports } from './transports';

// Data preview operations
export { previewData } from './dataPreview';
export { getDistinctValues } from './distinct';
export { countRows } from './count';

// Search operations
export { searchObjects } from './searchObjects';
export { findWhereUsed } from './whereUsed';

// Transport management
export { createTransport } from './createTransport';
export type { TransportConfig } from './createTransport';

// Diff operations
export { gitDiff } from './gitDiff';
export type { DiffResult, DiffHunk, SimpleDiffHunk, ModifiedDiffHunk } from './gitDiff';
