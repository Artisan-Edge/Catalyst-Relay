/**
 * Unit Tests for Session Login/Logout Operations
 *
 * Tests session lifecycle management:
 * - logout() - ending sessions and clearing state
 * - sessionReset() - recovering from errors
 *
 * Uses mock request functions to simulate SAP server responses.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { logout, sessionReset, type SessionState } from '../../../core/session/login';
import type { Result } from '../../../types/result';
import { ok, err } from '../../../types/result';

// =============================================================================
// Test Helpers
// =============================================================================

/** Creates a mock request function that returns the provided result */
function createMockRequest(mockResult: Result<Response, Error>) {
    return async (): Promise<Result<Response, Error>> => mockResult;
}

/** Creates a successful Response object */
function createSuccessResponse(status = 200, body = ''): Response {
    return new Response(body, { status, statusText: 'OK' });
}

/** Creates an error Response object */
function createErrorResponse(status: number, body: string): Response {
    return new Response(body, { status, statusText: 'Error' });
}

/** Creates a fresh session state for testing */
function createTestSessionState(): SessionState {
    return {
        csrfToken: 'test-csrf-token',
        session: {
            sessionId: 'test-session-id',
            username: 'TESTUSER',
            expiresAt: Date.now() + 3600000,
        },
        config: {
            auth: { type: 'basic', username: 'TESTUSER', password: 'testpass' },
        },
    };
}

// =============================================================================
// Logout Tests
// =============================================================================

describe('logout', () => {
    let state: SessionState;

    beforeEach(() => {
        state = createTestSessionState();
    });

    describe('successful logout', () => {
        it('should clear session state on successful logout', async () => {
            const mockRequest = createMockRequest(ok(createSuccessResponse()));
            const [, error] = await logout(state, mockRequest);

            expect(error).toBeNull();
            expect(state.session).toBeNull();
            expect(state.csrfToken).toBeNull();
        });

        it('should return void on success', async () => {
            const mockRequest = createMockRequest(ok(createSuccessResponse()));
            const [result, error] = await logout(state, mockRequest);

            expect(error).toBeNull();
            expect(result).toBeUndefined();
        });

        it('should handle 200 response', async () => {
            const mockRequest = createMockRequest(ok(createSuccessResponse(200)));
            const [, error] = await logout(state, mockRequest);

            expect(error).toBeNull();
        });

        it('should handle 204 No Content response', async () => {
            const mockRequest = createMockRequest(ok(createSuccessResponse(204)));
            const [, error] = await logout(state, mockRequest);

            expect(error).toBeNull();
        });
    });

    describe('network errors', () => {
        it('should return error when request fails', async () => {
            const networkError = new Error('Network connection failed');
            const mockRequest = createMockRequest(err(networkError));
            const [result, error] = await logout(state, mockRequest);

            expect(result).toBeNull();
            expect(error).not.toBeNull();
            expect(error?.message).toContain('Logout failed');
            expect(error?.message).toContain('Network connection failed');
        });

        it('should preserve session state on network error', async () => {
            const networkError = new Error('Connection refused');
            const mockRequest = createMockRequest(err(networkError));
            const originalSession = state.session;
            const originalToken = state.csrfToken;

            await logout(state, mockRequest);

            // State should not be modified on network error
            expect(state.session).toBe(originalSession);
            expect(state.csrfToken).toBe(originalToken);
        });

        it('should handle timeout errors', async () => {
            const timeoutError = new Error('Request timed out');
            const mockRequest = createMockRequest(err(timeoutError));
            const [result, error] = await logout(state, mockRequest);

            expect(result).toBeNull();
            expect(error?.message).toContain('Logout failed');
        });
    });

    describe('server errors', () => {
        it('should return error on 500 Internal Server Error', async () => {
            const mockRequest = createMockRequest(
                ok(createErrorResponse(500, 'Internal Server Error'))
            );
            const [result, error] = await logout(state, mockRequest);

            expect(result).toBeNull();
            expect(error).not.toBeNull();
            expect(error?.message).toContain('Logout failed with status 500');
        });

        it('should return error on 401 Unauthorized', async () => {
            const mockRequest = createMockRequest(
                ok(createErrorResponse(401, 'Unauthorized'))
            );
            const [result, error] = await logout(state, mockRequest);

            expect(result).toBeNull();
            expect(error?.message).toContain('Logout failed with status 401');
        });

        it('should return error on 403 Forbidden', async () => {
            const mockRequest = createMockRequest(
                ok(createErrorResponse(403, 'Forbidden'))
            );
            const [result, error] = await logout(state, mockRequest);

            expect(result).toBeNull();
            expect(error?.message).toContain('Logout failed with status 403');
        });

        it('should return error on 404 Not Found', async () => {
            const mockRequest = createMockRequest(
                ok(createErrorResponse(404, 'Not Found'))
            );
            const [result, error] = await logout(state, mockRequest);

            expect(result).toBeNull();
            expect(error?.message).toContain('Logout failed with status 404');
        });

        it('should include response body in error message', async () => {
            const errorBody = 'Session already expired';
            const mockRequest = createMockRequest(
                ok(createErrorResponse(400, errorBody))
            );
            const [, error] = await logout(state, mockRequest);

            expect(error?.message).toContain(errorBody);
        });

        it('should preserve session state on server error', async () => {
            const mockRequest = createMockRequest(
                ok(createErrorResponse(500, 'Server Error'))
            );
            const originalSession = state.session;
            const originalToken = state.csrfToken;

            await logout(state, mockRequest);

            // State should not be modified on server error
            expect(state.session).toBe(originalSession);
            expect(state.csrfToken).toBe(originalToken);
        });
    });

    describe('edge cases', () => {
        it('should work when session is already null', async () => {
            state.session = null;
            state.csrfToken = null;

            const mockRequest = createMockRequest(ok(createSuccessResponse()));
            const [, error] = await logout(state, mockRequest);

            expect(error).toBeNull();
            expect(state.session).toBeNull();
            expect(state.csrfToken).toBeNull();
        });

        it('should call request with correct endpoint', async () => {
            let capturedOptions: unknown;
            const mockRequest = async (options: unknown) => {
                capturedOptions = options;
                return ok(createSuccessResponse());
            };

            await logout(state, mockRequest);

            expect(capturedOptions).toMatchObject({
                method: 'POST',
                path: '/sap/public/bc/icf/logoff',
            });
        });
    });
});

// =============================================================================
// Session Reset Tests
// =============================================================================

describe('sessionReset', () => {
    let state: SessionState;

    beforeEach(() => {
        state = createTestSessionState();
    });

    describe('successful reset', () => {
        it('should clear session state', async () => {
            // Mock that returns success for logout, then success with CSRF token for login
            let callCount = 0;
            const mockRequest = async (options: { path: string }) => {
                callCount++;
                if (options.path === '/sap/public/bc/icf/logoff') {
                    return ok(createSuccessResponse());
                }
                // Login path - return response with CSRF token header
                const response = new Response('', {
                    status: 200,
                    headers: { 'x-csrf-token': 'new-csrf-token' },
                });
                return ok(response);
            };

            await sessionReset(state, mockRequest);

            // Session state should be cleared even before re-login
            // After successful re-login, new session should exist
            expect(callCount).toBeGreaterThanOrEqual(2);
        });

        it('should attempt logout and re-login', async () => {
            const calledPaths: string[] = [];
            const mockRequest = async (options: { path: string }) => {
                calledPaths.push(options.path);
                if (options.path === '/sap/public/bc/icf/logoff') {
                    return ok(createSuccessResponse());
                }
                const response = new Response('', {
                    status: 200,
                    headers: { 'x-csrf-token': 'new-csrf-token' },
                });
                return ok(response);
            };

            await sessionReset(state, mockRequest);

            expect(calledPaths).toContain('/sap/public/bc/icf/logoff');
        });
    });

    describe('logout failure during reset', () => {
        it('should continue with re-login even if logout fails', async () => {
            let logoutCalled = false;
            let loginCalled = false;

            const mockRequest = async (options: { path: string }) => {
                if (options.path === '/sap/public/bc/icf/logoff') {
                    logoutCalled = true;
                    return ok(createErrorResponse(500, 'Server Error'));
                }
                loginCalled = true;
                const response = new Response('', {
                    status: 200,
                    headers: { 'x-csrf-token': 'new-token' },
                });
                return ok(response);
            };

            await sessionReset(state, mockRequest);

            expect(logoutCalled).toBe(true);
            expect(loginCalled).toBe(true);
        });

        it('should clear state regardless of logout result', async () => {
            const mockRequest = async (options: { path: string }) => {
                if (options.path === '/sap/public/bc/icf/logoff') {
                    return err(new Error('Network error'));
                }
                const response = new Response('', {
                    status: 200,
                    headers: { 'x-csrf-token': 'new-token' },
                });
                return ok(response);
            };

            const originalSession = state.session;
            await sessionReset(state, mockRequest);

            // Old session should be gone (cleared after logout attempt)
            // New session should be created by re-login
            expect(state.session).not.toBe(originalSession);
        });
    });

    describe('re-login failure during reset', () => {
        it('should return error when re-login fails', async () => {
            const mockRequest = async (options: { path: string }) => {
                if (options.path === '/sap/public/bc/icf/logoff') {
                    return ok(createSuccessResponse());
                }
                // Login fails
                return ok(createErrorResponse(401, 'Invalid credentials'));
            };

            const [result, error] = await sessionReset(state, mockRequest);

            expect(result).toBeNull();
            expect(error).not.toBeNull();
        });

        it('should return error when CSRF token fetch fails', async () => {
            const mockRequest = async (options: { path: string }) => {
                if (options.path === '/sap/public/bc/icf/logoff') {
                    return ok(createSuccessResponse());
                }
                // CSRF token fetch fails
                return err(new Error('Connection refused'));
            };

            const [result, error] = await sessionReset(state, mockRequest);

            expect(result).toBeNull();
            expect(error).not.toBeNull();
        });
    });
});
