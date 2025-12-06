/**
 * POST /login — Authenticate and create session
 */

import type { Context } from 'hono';
import { createClient } from '../../../core/client';
import { clientConfigSchema } from '../../../types/config';
import type { ClientConfig } from '../../../types/config';
import { hashConnectionConfig } from '../../../core/session/hash';
import { ApiError } from '../../middleware/error';
import { formatZodError } from '../../utils';
import type { ISessionManager } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Request Schema (colocated)
// ─────────────────────────────────────────────────────────────────────────────

// Uses clientConfigSchema from types/config.ts

// ─────────────────────────────────────────────────────────────────────────────
// Response Type (colocated)
// ─────────────────────────────────────────────────────────────────────────────

export interface LoginResponse {
    sessionId: string;
    username: string;
    expiresAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export function loginHandler(sessionManager: ISessionManager) {
    return async (c: Context) => {
        const body = await c.req.json();

        // Validate request body
        const validation = clientConfigSchema.safeParse(body);
        if (!validation.success) {
            throw new ApiError(
                'VALIDATION_ERROR',
                `Invalid configuration: ${formatZodError(validation.error)}`,
                400
            );
        }

        const config = validation.data as ClientConfig;
        const configHash = hashConnectionConfig(config);

        // Check if client already exists for this config
        const existingClient = sessionManager.getClientByHash(configHash);

        if (existingClient) {
            // Reuse existing client
            const sessionId = sessionManager.createSession(configHash, existingClient, config.auth.type);

            if (!existingClient.session) {
                throw new ApiError('AUTH_FAILED', 'Client has no active session', 500);
            }

            return c.json({
                success: true,
                data: {
                    sessionId,
                    username: existingClient.session.username,
                    expiresAt: existingClient.session.expiresAt,
                } satisfies LoginResponse,
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
        sessionManager.registerClient(configHash, client);
        const sessionId = sessionManager.createSession(configHash, client, config.auth.type);

        return c.json({
            success: true,
            data: {
                sessionId,
                username: session.username,
                expiresAt: session.expiresAt,
            } satisfies LoginResponse,
        });
    };
}
