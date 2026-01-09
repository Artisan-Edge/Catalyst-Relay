import { z } from 'zod';

/**
 * Reference to an SAP development object
 */
export interface ObjectRef {
    /** Object name (e.g., 'ZTEST_VIEW') */
    name: string;
    /** File extension indicating object type (e.g., 'asddls') */
    extension: string;
}

/**
 * Object with content for create/update operations
 */
export interface ObjectContent extends ObjectRef {
    /** Source code content */
    content: string;
    /** Optional description for transport */
    description?: string;
}

/**
 * Virtual folder for tree discovery
 */
export interface VirtualFolder {
    /** Folder name (with ".." prefix for navigation) */
    name: string;
    /** Whether this folder has children of the same facet type */
    hasChildrenOfSameFacet: boolean;
    /** Optional count of items */
    count?: number;
}

/**
 * Tree discovery query for hierarchical browsing.
 * Matches Python TreeDiscoveryQuery structure.
 */
export interface TreeQuery {
    /** Package facet */
    PACKAGE?: VirtualFolder;
    /** Type facet */
    TYPE?: VirtualFolder;
    /** Group facet */
    GROUP?: VirtualFolder;
    /** API facet */
    API?: VirtualFolder;
}

/**
 * Data preview query
 */
export interface PreviewSQL {
    /** Object name (table or CDS view) */
    objectName: string;
    /** Object type ('table' or 'view') */
    objectType: 'table' | 'view';
    /** SQL query to execute */
    sqlQuery: string;
    /** Maximum rows to return (default: 100) */
    limit?: number;
}

// Zod schemas for runtime validation

export const objectRefSchema = z.object({
    name: z.string().min(1),
    extension: z.string().min(1),
});

export const objectContentSchema = objectRefSchema.extend({
    content: z.string(),
    description: z.string().optional(),
});

const virtualFolderSchema = z.object({
    name: z.string(),
    hasChildrenOfSameFacet: z.boolean(),
    count: z.number().optional(),
});

export const treeQuerySchema = z.object({
    PACKAGE: virtualFolderSchema.optional(),
    TYPE: virtualFolderSchema.optional(),
    GROUP: virtualFolderSchema.optional(),
    API: virtualFolderSchema.optional(),
});

export const previewQuerySchema = z.object({
    objectName: z.string().min(1),
    objectType: z.enum(['table', 'view']),
    sqlQuery: z.string().min(1),
    limit: z.number().positive().max(50000).optional(),
});
