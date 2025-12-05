// Authentication routes — login/logout and session management

import { Hono } from 'hono';
import { createClient } from '../../core/client';
import { clientConfigSchema } from '../../types/config';
import type { ClientConfig } from '../../types/config';
import { hashConnectionConfig } from '../../core/session/hash';
import type { SessionContext } from '../middleware/session';
import { ApiError } from '../middleware/error';
import { formatZodError } from '../utils';

// Create authentication routes with session manager and middleware
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

    // POST /login — Authenticate and create session
    auth.post('/login', async (c) => {
        const body = await c.req.json();

        // Validate request body
        const validation = clientConfigSchema.safeParse(body);
        if (!validation.success) {
            throw new ApiError('VALIDATION_ERROR', `Invalid configuration: ${formatZodError(validation.error)}`, 400);
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

    // DELETE /logout — End session and cleanup client if no other sessions reference it
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

        // TODO: Implement client cleanup when no sessions reference it
        // Need to unregister config hash from manager, but requires access to hash map
        if (!clientStillInUse) {
            // manager.unregisterClient(configHash) — need to track hash per session
        }

        return c.json({
            success: true,
            data: null,
        });
    });

    return auth;
}
