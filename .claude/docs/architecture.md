# Catalyst-Relay Architecture

## Overview

Catalyst-Relay is a dual-mode TypeScript package that provides SAP ADT (ABAP Development Tools) integration. It can be consumed as:

1. **Library** — Import functions directly into your application
2. **Server** — Run as a standalone HTTP API

## Dual-Mode Design

### Why Dual-Mode?

- **Library mode**: Zero network overhead for direct integrations (VS Code extensions, Electron apps)
- **Server mode**: Cross-platform HTTP API for web apps, CLIs, or services that can't bundle the library

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Consumer                              │
│  (VS Code Extension, Web App, CLI, etc.)                    │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            │                               │
            ▼                               ▼
┌───────────────────────┐       ┌───────────────────────┐
│     Library Mode      │       │     Server Mode       │
│                       │       │                       │
│  import { login }     │       │  POST /login          │
│  from 'catalyst-relay'│       │  http://localhost:443 │
└───────────────────────┘       └───────────────────────┘
            │                               │
            └───────────────┬───────────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │           core/               │
            │                               │
            │  Pure business logic          │
            │  - ADT client                 │
            │  - Session management         │
            │  - Authentication             │
            │  - CRAUD operations           │
            │  - Data preview               │
            └───────────────────────────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │        SAP ADT Server         │
            └───────────────────────────────┘
```

### Module Boundaries

| Module | Responsibility | Can Import From |
|--------|----------------|-----------------|
| `core/` | Business logic, ADT operations | `types/` only |
| `types/` | Type definitions, Zod schemas | Nothing (leaf module) |
| `server/` | HTTP routing, middleware | `core/`, `types/` |
| `index.ts` | Library exports | `core/`, `types/` |
| `server.ts` | Server entry point | `server/`, `core/`, `types/` |

## Core Module Design

### Client (`core/client.ts`)

The `ADTClient` class handles:
- HTTP session management with SAP ADT
- CSRF token lifecycle (fetch, cache, refresh on 401)
- Request/response serialization
- Error normalization

```typescript
interface ADTClient {
    // Lifecycle
    login(): Promise<Result<Session>>;
    logout(): Promise<Result<void>>;

    // CRAUD
    read(objects: ObjectRef[]): Promise<Result<ObjectContent[]>>;
    upsert(objects: ObjectContent[], transport: string): Promise<Result<UpsertResult[]>>;
    activate(objects: ObjectRef[]): Promise<Result<ActivationResult[]>>;
    delete(objects: ObjectRef[], transport?: string): Promise<Result<void>>;

    // Discovery
    getPackages(): Promise<Result<Package[]>>;
    getTree(query: TreeQuery): Promise<Result<TreeNode[]>>;
    getTransports(packageName: string): Promise<Result<Transport[]>>;

    // Data Preview
    previewData(query: PreviewQuery): Promise<Result<DataFrame>>;
    getDistinctValues(query: DistinctQuery): Promise<Result<DistinctResult>>;
    countRows(query: CountQuery): Promise<Result<number>>;

    // Search
    search(query: string, types?: ObjectType[]): Promise<Result<SearchResult[]>>;
    whereUsed(object: ObjectRef): Promise<Result<Dependency[]>>;
}
```

### Authentication (`core/auth/`)

Three authentication strategies:

| Strategy | File | Use Case |
|----------|------|----------|
| Basic | `basic.ts` | Username/password |
| SAML | `saml.ts` | SSO via browser automation |
| SSO | `sso.ts` | Kerberos/Windows auth |

Each strategy implements:
```typescript
interface AuthStrategy {
    authenticate(config: AuthConfig): Promise<Result<AuthSession>>;
    refresh(session: AuthSession): Promise<Result<AuthSession>>;
    revoke(session: AuthSession): Promise<Result<void>>;
}
```

### Session Management (`core/session/`)

In-memory session store with:
- Configurable timeout (default: 3h, SAML: 30min)
- Background cleanup task (every 60s)
- Config hash deduplication (reuse existing sessions)

```typescript
interface SessionManager {
    create(client: ADTClient): string;  // Returns session ID
    get(sessionId: string): ADTClient | null;
    refresh(sessionId: string): void;
    destroy(sessionId: string): void;
}
```

## Server Module Design

### Routes (`server/routes/`)

Thin wrappers that:
1. Parse and validate request body (Zod)
2. Extract session ID from header
3. Call core function
4. Return standardized response

```typescript
// Example: routes/login.ts
app.post('/login', async (c) => {
    const body = await c.req.json();
    const [config, parseError] = loginSchema.safeParse(body);
    if (parseError) return c.json({ success: false, error: parseError }, 400);

    const [session, error] = await login(config);
    if (error) return c.json({ success: false, error: error.message }, 401);

    return c.json({ success: true, data: session });
});
```

### Middleware (`server/middleware/`)

| Middleware | Purpose |
|------------|---------|
| `session.ts` | Validate `X-Session-ID` header |
| `cors.ts` | CORS configuration |
| `logger.ts` | Request/response logging |

## Response Conventions

### Success Response
```typescript
interface SuccessResponse<T> {
    success: true;
    data: T;
}
```

### Error Response
```typescript
interface ErrorResponse {
    success: false;
    error: string;
    code?: string;  // Machine-readable error code
}
```

## Error Handling Strategy

### Error Codes

| Code | Meaning |
|------|---------|
| `AUTH_FAILED` | Invalid credentials |
| `SESSION_EXPIRED` | Session timed out |
| `CSRF_INVALID` | CSRF token rejected |
| `OBJECT_LOCKED` | Object locked by another user |
| `TRANSPORT_REQUIRED` | Transport needed for operation |
| `ACTIVATION_FAILED` | Syntax/dependency errors |
| `NOT_FOUND` | Object doesn't exist |

### Error Flow

```
ADT Response → Parse Error → Normalize → Return Tuple
     ↓
[Check status code]
     ↓
[Extract error from XML/JSON body]
     ↓
[Map to error code]
     ↓
[null, { code, message, details }]
```

## SAP ADT Integration Details

### CSRF Token Lifecycle

1. On first request: Send `x-csrf-token: fetch` header
2. SAP returns token in response header
3. Cache token, include in subsequent requests
4. On 401/403: Re-fetch token and retry once

### Object Locking

SAP requires explicit locks before modification:

```
1. Lock object → Get lock handle
2. Make changes
3. Save changes (with lock handle)
4. Unlock object (or let timeout)
```

Our implementation handles this transparently in `upsert()`.

### Activation

Activation compiles ABAP code. May fail due to:
- Syntax errors
- Missing dependencies
- Circular references

`activate()` returns detailed error messages from SAP.

## Testing Strategy

### Unit Tests
- Core functions with mocked HTTP responses
- Zod schema validation
- Error handling paths

### Integration Tests
- Full request/response cycle against mock SAP server
- Session lifecycle
- Authentication flows

### Compatibility Tests
- Import library in Node.js (no Bun APIs)
- Run test suite in both Bun and Node

## Future Considerations

- **WebSocket support**: Real-time activation status
- **Connection pooling**: Reuse HTTP connections
- **Retry logic**: Exponential backoff for transient failures
- **Caching**: Cache immutable data (object metadata)
