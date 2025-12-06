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
export type { AdtRequestor, ObjectConfig, ConfiguredExtension } from './types';
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
export { previewData } from './data';
export { getDistinctValues } from './distinct';
export { countRows } from './count';

// Query building utilities
export { quoteIdentifier, buildWhereClauses, buildOrderByClauses, formatValue } from './queryBuilder';

// Search operations
export { searchObjects } from './searchObjects';
export { findWhereUsed } from './whereUsed';
