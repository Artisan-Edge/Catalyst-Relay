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
    /** Package to browse (e.g., '$TMP', 'ZPACKAGE') */
    package?: string;
    /** Folder type to expand */
    folderType?: 'PACKAGE' | 'TYPE' | 'GROUP' | 'API';
    /** Parent path for nested queries */
    parentPath?: string;
}

/**
 * Data preview query
 */
export interface PreviewQuery {
    /** Object name (table or CDS view) */
    objectName: string;
    /** Object type ('table' or 'view') */
    objectType: 'table' | 'view';
    /** WHERE clause filters */
    filters?: Filter[];
    /** ORDER BY columns */
    orderBy?: OrderBy[];
    /** Maximum rows to return (default: 100) */
    limit?: number;
    /** Row offset for pagination */
    offset?: number;
}

/**
 * Filter condition for data preview
 */
export interface Filter {
    column: string;
    operator: FilterOperator;
    value: string | number | boolean | null;
}

export type FilterOperator =
    | 'eq'    // Equal
    | 'ne'    // Not equal
    | 'gt'    // Greater than
    | 'ge'    // Greater than or equal
    | 'lt'    // Less than
    | 'le'    // Less than or equal
    | 'like'  // Pattern match
    | 'in';   // In list

/**
 * Sort specification for data preview
 */
export interface OrderBy {
    column: string;
    direction: 'asc' | 'desc';
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
    package: z.string().optional(),
    folderType: z.enum(['PACKAGE', 'TYPE', 'GROUP', 'API']).optional(),
    parentPath: z.string().optional(),
});

export const filterSchema = z.object({
    column: z.string().min(1),
    operator: z.enum(['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'like', 'in']),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

export const orderBySchema = z.object({
    column: z.string().min(1),
    direction: z.enum(['asc', 'desc']),
});

export const previewQuerySchema = z.object({
    objectName: z.string().min(1),
    objectType: z.enum(['table', 'view']),
    filters: z.array(filterSchema).optional(),
    orderBy: z.array(orderBySchema).optional(),
    limit: z.number().positive().max(50000).optional(),
    offset: z.number().nonnegative().optional(),
});
