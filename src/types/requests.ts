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
 * Tree discovery query for hierarchical browsing
 */
export interface TreeQuery {
    /** Package to browse (e.g., '$TMP', 'ZSNAP_F01'). Omit to get top-level packages only. */
    package?: string;
    /** Path within the package for drilling down (e.g., 'CORE_DATA_SERVICES/DATA_DEFINITIONS') */
    path?: string;
    /** Filter by object owner (e.g., 'EBOSCH'). Only returns objects created by this user. */
    owner?: string;
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

export const treeQuerySchema = z.object({
    package: z.string().min(1).optional(),
    path: z.string().optional(),
    owner: z.string().min(1).optional(),
});

export const previewQuerySchema = z.object({
    objectName: z.string().min(1),
    objectType: z.enum(['table', 'view']),
    sqlQuery: z.string().min(1),
    limit: z.number().positive().max(50000).optional(),
});
