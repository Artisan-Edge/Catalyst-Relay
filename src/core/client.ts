import type { ClientConfig, AuthConfig } from '../types/config';
import type {
    ObjectRef,
    ObjectContent,
    TreeQuery,
    PreviewQuery,
} from '../types/requests';
import type {
    Session,
    ObjectWithContent,
    UpsertResult,
    ActivationResult,
    TreeNode,
    Transport,
    Package,
    DataFrame,
    DistinctResult,
    SearchResult,
    Dependency,
} from '../types/responses';
import type { Result, AsyncResult } from '../types/result';
import { ok, err } from '../types/result';

/**
 * ADT Client interface
 *
 * Provides all operations for interacting with SAP ADT servers.
 * Handles session management, CSRF tokens, and error normalization internally.
 */
export interface ADTClient {
    /** Current session info (null if not logged in) */
    readonly session: Session | null;

    // Lifecycle
    login(): AsyncResult<Session>;
    logout(): AsyncResult<void>;

    // CRAUD Operations
    read(objects: ObjectRef[]): AsyncResult<ObjectWithContent[]>;
    upsert(objects: ObjectContent[], transport: string): AsyncResult<UpsertResult[]>;
    activate(objects: ObjectRef[]): AsyncResult<ActivationResult[]>;
    delete(objects: ObjectRef[], transport?: string): AsyncResult<void>;

    // Discovery
    getPackages(): AsyncResult<Package[]>;
    getTree(query: TreeQuery): AsyncResult<TreeNode[]>;
    getTransports(packageName: string): AsyncResult<Transport[]>;

    // Data Preview
    previewData(query: PreviewQuery): AsyncResult<DataFrame>;
    getDistinctValues(objectName: string, column: string): AsyncResult<DistinctResult>;
    countRows(objectName: string, objectType: 'table' | 'view'): AsyncResult<number>;

    // Search
    search(query: string, types?: string[]): AsyncResult<SearchResult[]>;
    whereUsed(object: ObjectRef): AsyncResult<Dependency[]>;
}

/**
 * Internal client state
 */
interface ClientState {
    config: ClientConfig;
    session: Session | null;
    csrfToken: string | null;
}

/**
 * Create a new ADT client
 *
 * @param config - Client configuration
 * @returns Result tuple with client or error
 *
 * @example
 * const [client, error] = await createClient({
 *     url: 'https://sap-server:443',
 *     client: '100',
 *     auth: { type: 'basic', username: 'user', password: 'pass' }
 * });
 * if (error) {
 *     console.error('Failed to create client:', error);
 *     return;
 * }
 * const [session, loginError] = await client.login();
 */
export function createClient(config: ClientConfig): Result<ADTClient, Error> {
    // Validate config
    if (!config.url) {
        return err(new Error('Client config missing required field: url'));
    }
    if (!config.client) {
        return err(new Error('Client config missing required field: client'));
    }
    if (!config.auth) {
        return err(new Error('Client config missing required field: auth'));
    }

    const state: ClientState = {
        config,
        session: null,
        csrfToken: null,
    };

    const client: ADTClient = {
        get session() {
            return state.session;
        },

        async login(): AsyncResult<Session> {
            // TODO: Implement authentication based on auth type
            return err(new Error('Not implemented'));
        },

        async logout(): AsyncResult<void> {
            // TODO: Implement logout
            return err(new Error('Not implemented'));
        },

        async read(objects: ObjectRef[]): AsyncResult<ObjectWithContent[]> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement batch read
            return err(new Error('Not implemented'));
        },

        async upsert(objects: ObjectContent[], transport: string): AsyncResult<UpsertResult[]> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement batch upsert
            return err(new Error('Not implemented'));
        },

        async activate(objects: ObjectRef[]): AsyncResult<ActivationResult[]> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement batch activation
            return err(new Error('Not implemented'));
        },

        async delete(objects: ObjectRef[], transport?: string): AsyncResult<void> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement batch delete
            return err(new Error('Not implemented'));
        },

        async getPackages(): AsyncResult<Package[]> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement package discovery
            return err(new Error('Not implemented'));
        },

        async getTree(query: TreeQuery): AsyncResult<TreeNode[]> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement tree discovery
            return err(new Error('Not implemented'));
        },

        async getTransports(packageName: string): AsyncResult<Transport[]> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement transport listing
            return err(new Error('Not implemented'));
        },

        async previewData(query: PreviewQuery): AsyncResult<DataFrame> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement data preview
            return err(new Error('Not implemented'));
        },

        async getDistinctValues(objectName: string, column: string): AsyncResult<DistinctResult> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement distinct values
            return err(new Error('Not implemented'));
        },

        async countRows(objectName: string, objectType: 'table' | 'view'): AsyncResult<number> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement row count
            return err(new Error('Not implemented'));
        },

        async search(query: string, types?: string[]): AsyncResult<SearchResult[]> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement search
            return err(new Error('Not implemented'));
        },

        async whereUsed(object: ObjectRef): AsyncResult<Dependency[]> {
            if (!state.session) return err(new Error('Not logged in'));
            // TODO: Implement where-used
            return err(new Error('Not implemented'));
        },
    };

    return ok(client);
}
