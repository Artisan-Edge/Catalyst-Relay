/**
 * API Response Types
 *
 * Generic response wrappers and error codes only.
 * Domain-specific types live in their colocated modules under core/adt/.
 */

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
