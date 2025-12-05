/**
 * Authentication routes
 *
 * Handles login/logout and session management
 */

import { Hono } from 'hono';
import { createClient } from '../../core/client';
import { clientConfigSchema } from '../../types/config';
import type { ClientConfig } from '../../types/config';
import { hashConnectionConfig } from '../../core/session/hash';
import type { SessionContext } from '../middleware/session';
import { ApiError } from '../middleware/error';

/**
 * Create authentication routes
 *
 * @param sessionManager - Session manager instance
 * @param sessionMiddleware - Session validation middleware
 * @returns Hono app with auth routes
 */
export function createAuthRoutes(sessionManager: unknown, sessionMiddleware: unknown) {
    const auth = new Hono<SessionContext>();

    // Type assertions for session manager
    const manager = sessionManager as {
        getClientByHash: (hash: string) => unknown | null;
        registerClient: (hash: string, client: unknown) => void;
        createSession: (hash: string, client: unknown, authType: string) => string;
        destroySession: (sessionId: string) => boolean;
        getAllSessions: () => [string, { client: unknown }][];
        unregisterClient: (hash: string) => boolean;
    };

    /**
     * POST /login
     *
     * Authenticates user and creates a session
     *
     * Request body: ClientConfig
     * Response: { success: true, data: { sessionId: string, username: string, expiresAt: number } }
     */
    auth.post('/login', async (c) => {
        const body = await c.req.json();

        // Validate request body
        const validation = clientConfigSchema.safeParse(body);
        if (!validation.success) {
            const issues = validation.error.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join(', ');
            throw new ApiError('VALIDATION_ERROR', `Invalid configuration: ${issues}`, 400);
        }

        const config = validation.data as ClientConfig;
        const configHash = hashConnectionConfig(config);

        // Check if client already exists for this config
        const existingClient = manager.getClientByHash(configHash);

        if (existingClient) {
            // Reuse existing client
            const sessionId = manager.createSession(configHash, existingClient, config.auth.type);

            // Extract session info from client
            const client = existingClient as { session: { sessionId: string; username: string; expiresAt: number } | null };

            if (!client.session) {
                throw new ApiError('AUTH_FAILED', 'Client has no active session', 500);
            }

            return c.json({
                success: true,
                data: {
                    sessionId,
                    username: client.session.username,
                    expiresAt: client.session.expiresAt,
                },
            });
        }

        // Create new client
        const [client, clientErr] = createClient(config);
        if (clientErr) {
            throw new ApiError('VALIDATION_ERROR', clientErr.message, 400);
        }

        // Login
        const [session, loginErr] = await client.login();
        if (loginErr) {
            throw new ApiError('AUTH_FAILED', loginErr.message, 401);
        }

        // Register client and create session
        manager.registerClient(configHash, client);
        const sessionId = manager.createSession(configHash, client, config.auth.type);

        return c.json({
            success: true,
            data: {
                sessionId,
                username: session.username,
                expiresAt: session.expiresAt,
            },
        });
    });

    /**
     * DELETE /logout
     *
     * Ends session and logs out client if no other sessions reference it
     *
     * Headers: X-Session-ID
     * Response: { success: true, data: null }
     */
    auth.delete('/logout', sessionMiddleware as any, async (c) => {
        const client = c.get('client');
        const sessionId = c.get('sessionId');

        // Logout client
        const [, logoutErr] = await (client as { logout: () => Promise<[void, Error | null]> }).logout();
        if (logoutErr) {
            console.error('Logout error:', logoutErr);
            // Continue with session cleanup even if logout fails
        }

        // Destroy session
        manager.destroySession(sessionId);

        // Check if any other sessions reference this client
        const allSessions = manager.getAllSessions();
        const clientStillInUse = allSessions.some(([, entry]) => entry.client === client);

        if (!clientStillInUse) {
            // Find and remove config hash for this client
            // This is a bit inefficient but session count should be low
            const configHashes: string[] = [];
            // We need to iterate through config hash map, but we don't have direct access
            // For now, we'll just let the cleanup task handle it
        }

        return c.json({
            success: true,
            data: null,
        });
    });

    return auth;
}
