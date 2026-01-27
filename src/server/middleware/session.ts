/**
 * Session validation middleware
 *
 * Validates X-Session-ID header and attaches client to context
 */

import { createMiddleware } from 'hono/factory';
import type { ADTClient } from '../../client';
import type { ISessionManager, SessionContext } from '../routes/types';

/**
 * Session middleware factory
 *
 * Creates middleware that validates session headers and attaches
 * the authenticated client to the Hono context.
 *
 * @param sessionManager - Session manager instance
 * @returns Hono middleware
 *
 * @example
 * ```typescript
 * const manager = new SessionManager();
 * const middleware = createSessionMiddleware(manager);
 * app.use('/api/*', middleware);
 * ```
 */
export function createSessionMiddleware(sessionManager: ISessionManager) {
    return createMiddleware<SessionContext>(async (c, next) => {
        const sessionId = c.req.header('X-Session-ID');

        if (!sessionId) {
            return c.json({ success: false as const, error: 'Session ID missing' }, 401);
        }

        const session = sessionManager.getSession(sessionId);

        if (!session) {
            // 440 is Login Timeout - use 401 as it's a standard code
            return c.json(
                {
                    success: false as const,
                    error: 'Invalid session ID possibly due to server restart. Please log in again.',
                    code: 'SESSION_EXPIRED',
                },
                401
            );
        }

        // Refresh session activity
        sessionManager.refreshSession(sessionId);

        // Attach to context
        c.set('client', session.client);
        c.set('sessionId', sessionId);

        await next();
        return;
    });
}

// Re-export SessionContext for convenience
export type { SessionContext };
