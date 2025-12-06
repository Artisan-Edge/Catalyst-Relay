/**
 * Shared types for route handlers
 *
 * Provides properly typed interfaces for session management and client access,
 * eliminating the need for unsafe type assertions in route files.
 */

import type { Context } from 'hono';
import type { ADTClient } from '../../core/client';
import type { AuthType } from '../../types';

/**
 * Session entry stored in session manager
 */
export interface SessionEntry {
    client: ADTClient;
    lastActivity: Date;
    authType: AuthType;
}

/**
 * Session manager interface for route handlers
 */
export interface ISessionManager {
    createSession(configHash: string, client: ADTClient, authType: AuthType): string;
    getSession(sessionId: string): SessionEntry | null;
    refreshSession(sessionId: string): boolean;
    destroySession(sessionId: string): boolean;
    getClientByHash(configHash: string): ADTClient | null;
    registerClient(configHash: string, client: ADTClient): void;
    unregisterClient(configHash: string): boolean;
    getAllSessions(): [string, SessionEntry][];
}

/**
 * Hono context with session variables
 */
export interface SessionContext {
    Variables: {
        client: ADTClient;
        sessionId: string;
    };
}

/**
 * Route context type for authenticated routes
 */
export type RouteContext = Context<SessionContext>;

/**
 * Standard API success response
 */
export interface SuccessResponse<T> {
    success: true;
    data: T;
}

/**
 * Standard API error response
 */
export interface ErrorResponse {
    success: false;
    error: string;
    code?: string;
}

/**
 * Combined API response type
 */
export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;
