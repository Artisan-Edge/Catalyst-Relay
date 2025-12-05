/**
 * Error handling middleware
 *
 * Standardizes error responses across all routes
 */

import { createMiddleware } from 'hono/factory';
import type { ErrorCode } from '../../types/responses';

/**
 * Custom error class for API errors with codes
 */
export class ApiError extends Error {
    constructor(
        public code: ErrorCode,
        message: string,
        public statusCode: number = 500,
        public details?: unknown
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

/**
 * Error handler middleware
 *
 * Catches errors thrown in route handlers and converts them to
 * standardized error responses.
 *
 * @example
 * ```typescript
 * app.use('*', errorMiddleware);
 *
 * // In a route handler:
 * throw new ApiError('AUTH_FAILED', 'Invalid credentials', 401);
 * ```
 */
export const errorMiddleware = createMiddleware(async (c, next) => {
    try {
        await next();
        return;
    } catch (error) {
        console.error('Route error:', error);

        // Handle ApiError instances
        if (error instanceof ApiError) {
            return c.json(
                {
                    success: false as const,
                    error: error.message,
                    code: error.code,
                    details: error.details,
                },
                error.statusCode as 400 | 401 | 403 | 404 | 500
            );
        }

        // Handle generic errors
        const message = error instanceof Error ? error.message : 'Unknown error';

        return c.json(
            {
                success: false as const,
                error: message,
                code: 'UNKNOWN_ERROR' as ErrorCode,
            },
            500
        );
    }
});
