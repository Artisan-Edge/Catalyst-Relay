/**
 * Standard API response wrapper
 */
export interface SuccessResponse<T> {
    success: true;
    data: T;
}

export interface ErrorResponse {
    success: false;
    error: string;
    code?: ErrorCode;
    details?: unknown;
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

/**
 * Machine-readable error codes
 */
export type ErrorCode =
    | 'AUTH_FAILED'
    | 'SESSION_EXPIRED'
    | 'SESSION_NOT_FOUND'
    | 'CSRF_INVALID'
    | 'OBJECT_LOCKED'
    | 'OBJECT_NOT_FOUND'
    | 'TRANSPORT_REQUIRED'
    | 'ACTIVATION_FAILED'
    | 'VALIDATION_ERROR'
    | 'NETWORK_ERROR'
    | 'UNKNOWN_ERROR';

/**
 * Session data returned after successful login
 */
export interface Session {
    /** Unique session identifier */
    sessionId: string;
    /** Authenticated username */
    username: string;
    /** Session expiration timestamp */
    expiresAt: number;
}

/**
 * Object metadata
 */
export interface ObjectMetadata {
    name: string;
    extension: string;
    package: string;
    description?: string;
    createdBy?: string;
    createdAt?: string;
    modifiedBy?: string;
    modifiedAt?: string;
}

/**
 * Object with content (read response)
 */
export interface ObjectWithContent extends ObjectMetadata {
    content: string;
}

/**
 * Result of upsert operation
 */
export interface UpsertResult {
    name: string;
    extension: string;
    status: 'created' | 'updated' | 'unchanged';
    transport?: string;
}

/**
 * Result of activation operation
 */
export interface ActivationResult {
    name: string;
    extension: string;
    status: 'success' | 'warning' | 'error';
    messages: ActivationMessage[];
}

export interface ActivationMessage {
    severity: 'error' | 'warning' | 'info';
    text: string;
    line?: number;
    column?: number;
}

/**
 * Tree node for hierarchical browsing
 */
export interface TreeNode {
    name: string;
    type: 'folder' | 'object';
    objectType?: string;
    extension?: string;
    hasChildren?: boolean;
    children?: TreeNode[];
}

/**
 * Transport request
 */
export interface Transport {
    id: string;
    description: string;
    owner: string;
    status: 'modifiable' | 'released';
}

/**
 * Package info
 */
export interface Package {
    name: string;
    description?: string;
    parentPackage?: string;
}

/**
 * Data preview result (columnar format)
 */
export interface DataFrame {
    columns: ColumnInfo[];
    rows: unknown[][];
    totalRows?: number;
}

export interface ColumnInfo {
    name: string;
    dataType: string;
    label?: string;
}

/**
 * Distinct values result
 */
export interface DistinctResult {
    column: string;
    values: Array<{
        value: unknown;
        count: number;
    }>;
}

/**
 * Search result
 */
export interface SearchResult {
    name: string;
    extension: string;
    package: string;
    description?: string;
    objectType: string;
}

/**
 * Where-used dependency
 */
export interface Dependency {
    name: string;
    extension: string;
    package: string;
    usageType: string;
}
