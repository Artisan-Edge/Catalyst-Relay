/**
 * Client internal type definitions
 */

import type { ClientConfig } from '../../types/config';
import type { Session } from '../session/types';
import type { AuthStrategy } from '../auth/types';
import type { AsyncResult } from '../../types/result';

// HTTP request options for Node.js http/https modules
export interface HttpRequestOptions {
    method: string;
    headers: Record<string, string>;
    body?: string | undefined;
    cert?: string | undefined;
    key?: string | undefined;
    rejectUnauthorized?: boolean | undefined;
    timeout?: number | undefined;
}

// HTTP request options for internal operations
export interface RequestOptions {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    params?: Record<string, string | number>;
    headers?: Record<string, string>;
    body?: string;
}

// Request function type
export type RequestFn = (options: RequestOptions) => AsyncResult<Response, Error>;

// SSO certificate pair for mTLS authentication
export interface SsoCerts {
    cert: string;
    key: string;
}

// Internal client state (implements SessionState interface from session)
export interface ClientState {
    config: ClientConfig;
    session: Session | null;
    csrfToken: string | null;
    cookies: Map<string, string>;
    authStrategy: AuthStrategy;
}

// Context object passed to extracted method functions
export interface ClientContext {
    // State access
    state: ClientState;
    ssoCerts: SsoCerts | undefined;

    // Bound methods from class
    request: RequestFn;
    buildCookieHeader: () => string | null;
    storeCookies: (response: Response) => void;
    startAutoRefresh: (intervalMs: number) => void;
    stopAutoRefresh: () => void;
}
