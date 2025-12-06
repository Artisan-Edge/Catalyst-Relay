# Catalyst-Relay

TypeScript port of SNAP-Relay-API — middleware bridging frontend applications to SAP ADT (ABAP Development Tools) servers.

## Quick Reference

| Item | Value |
|------|-------|
| Runtime | Bun (dev) / Node.js (library consumers) |
| Framework | Hono |
| Validation | Zod |
| Testing | Vitest |
| Build | tsup |

## Dual-Mode Architecture

This package operates in two modes:

**Library Mode** — Direct function imports:
```typescript
import { createClient, login, executeQuery } from 'catalyst-relay';
```

**Server Mode** — HTTP API:
```bash
bun run src/server.ts
```

### Critical Constraint: Runtime Agnostic

**NEVER use Bun-specific APIs.** Library consumers may run on Node.js.

Forbidden:
- `Bun.serve()`, `Bun.file()`, `Bun.write()`
- `bun:*` module imports
- Any API requiring Bun runtime

Required:
- Web standard APIs: `fetch`, `Request`, `Response`, `URL`
- Cross-platform npm packages only
- Test library imports in Node before publishing

---

## Project Structure

```
src/
├── index.ts              # Library exports (re-exports from core/)
├── server.ts             # Hono HTTP server (thin wrapper over core/)
│
├── core/                 # Pure business logic (one function per file)
│   ├── index.ts          # Barrel exports
│   ├── client.ts         # ADT client implementation
│   ├── config.ts         # Configuration loading
│   ├── auth/             # Authentication strategies
│   ├── session/          # Session management
│   ├── adt/              # ADT operations (CRAUD, discovery, preview)
│   └── utils/            # Internal utilities
│
├── types/                # Shared type definitions
│   ├── index.ts          # Type exports
│   ├── requests.ts       # Request schemas
│   ├── responses.ts      # Response schemas
│   ├── config.ts         # Configuration types
│   └── result.ts         # Go-style error tuples
│
├── server/               # Server-specific code
│   ├── routes/           # Route handlers (one file per route)
│   │   ├── index.ts      # Route wiring
│   │   ├── types.ts      # Shared route types
│   │   ├── auth/         # Auth routes
│   │   ├── discovery/    # Discovery routes
│   │   ├── objects/      # CRAUD routes
│   │   ├── preview/      # Data preview routes
│   │   └── search/       # Search routes
│   └── middleware/       # Hono middleware
│
└── __tests__/            # Test files (mirror src/ structure)
```

---

## Package Organization Patterns

### One File Per Route (Server)

Each HTTP endpoint gets its own file containing:
1. Colocated request schema (Zod)
2. Colocated response type
3. Single handler function

```
server/routes/
├── index.ts              # Wires all routes to Hono app
├── types.ts              # Shared types (ISessionManager, SessionContext)
├── auth/
│   ├── login.ts          → POST /login
│   └── logout.ts         → DELETE /logout
├── discovery/
│   ├── packages.ts       → GET /packages
│   ├── tree.ts           → POST /tree
│   └── transports.ts     → GET /transports/:package
├── objects/
│   ├── read.ts           → POST /objects/read
│   ├── upsert.ts         → POST /objects/upsert/:package/:transport?
│   ├── activate.ts       → POST /objects/activate
│   └── delete.ts         → DELETE /objects/:transport?
├── preview/
│   ├── data.ts           → POST /preview/data
│   ├── distinct.ts       → POST /preview/distinct
│   └── count.ts          → POST /preview/count
└── search/
    ├── search.ts         → POST /search/:query
    └── whereUsed.ts      → POST /where-used
```

**Route file pattern:**
```typescript
// server/routes/auth/login.ts

import { z } from 'zod';
import type { ISessionManager } from '../types';

// Request schema (colocated)
export const loginRequestSchema = z.object({ ... });

// Response type (colocated)
export interface LoginResponse {
    sessionId: string;
    username: string;
}

// Single handler export
export function loginHandler(sessionManager: ISessionManager) {
    return async (c: Context) => { ... };
}
```

### One Function Per File (Core)

Each core package follows one-function-per-file with shared types in `types.ts`:

```
core/adt/
├── index.ts              # Barrel exports
├── types.ts              # Shared types (AdtRequestor, ObjectConfig)
├── helpers.ts            # Internal helpers (not exported from barrel)
│
│  # CRAUD Operations
├── read.ts               → readObject()
├── create.ts             → createObject()
├── update.ts             → updateObject()
├── delete.ts             → deleteObject()
├── lock.ts               → lockObject(), unlockObject()
├── activation.ts         → activateObjects()
│
│  # Discovery
├── packages.ts           → getPackages()
├── tree.ts               → getTree()
├── transports.ts         → getTransports()
│
│  # Data Preview
├── data.ts               → previewData()
├── distinct.ts           → getDistinctValues()
├── count.ts              → countRows()
├── previewParser.ts      # Internal parser (not exported)
├── queryBuilder.ts       # SQL utilities
│
│  # Search
├── searchObjects.ts      → searchObjects()
└── whereUsed.ts          → findWhereUsed()
```

### Package `types.ts` Rules

Each package's `types.ts` should **ONLY** contain types used in multiple files:

```typescript
// core/adt/types.ts - GOOD: used by read.ts, create.ts, update.ts, etc.
export interface AdtRequestor { ... }
export interface ObjectConfig { ... }

// core/adt/tree.ts - GOOD: internal types stay in file
interface VirtualFolder { ... }      // Only used in tree.ts
interface TreeDiscoveryQuery { ... } // Only used in tree.ts
```

### Import Hierarchy

Files should have a clear traceable import hierarchy with no circular dependencies:

```
types.ts           (shared types, no imports from package)
    ↓
helpers.ts         (internal utilities, imports types)
    ↓
individual files   (import from types and helpers)
    ↓
index.ts           (barrel exports, imports from all)
```

---

## Code Style — Non-Negotiable Rules

### 1. Guard Clauses (Early Returns)

**ALWAYS** use guard clauses. Violations will be called out immediately.

BAD:
```typescript
function processData(data: Data | null) {
    if (data) {
        if (data.items.length > 0) {
            // lots of code
        }
    }
}
```

GOOD:
```typescript
function processData(data: Data | null) {
    if (!data) return;
    if (data.items.length === 0) return;

    // lots of code at base indentation
}
```

### 2. Error Tuples (Go-style)

All fallible operations return `[result, error]` tuples.

```typescript
type Result<T, E = Error> = [T, null] | [null, E];

// Usage
const [client, error] = await createClient(config);
if (error) {
    console.error('Failed to create client:', error);
    return;
}
// client is guaranteed non-null here
```

### 3. DRY Principle

Before writing ANY code:
1. Does this functionality exist? → Reuse it
2. Will this be used in multiple places? → Make it shared
3. Am I copy-pasting? → STOP and refactor

### 4. One Function Per File

Each file should generally export one primary function. Exceptions:
- Tightly coupled functions (e.g., `lockObject()` + `unlockObject()`)
- Internal helpers only used in that file

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files/folders | camelCase | `dataPreview.ts`, `authUtils/` |
| Types/Interfaces | PascalCase | `ClientConfig`, `LoginResponse` |
| Functions | camelCase | `createClient`, `fetchData` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES`, `DEFAULT_TIMEOUT` |
| Booleans | is/has/can prefix | `isConnected`, `hasError`, `canRetry` |

## TypeScript Patterns

### Type Definitions
```typescript
// Use interfaces for objects
interface ClientConfig {
    url: string;
    auth: AuthConfig;
}

// Use type for unions/intersections
type AuthType = 'basic' | 'saml' | 'sso';
type Result<T> = [T, null] | [null, Error];
```

### Null Handling
```typescript
// Optional chaining
const value = response?.data?.field;

// Nullish coalescing
const timeout = config.timeout ?? DEFAULT_TIMEOUT;

// Guard clause (preferred)
if (!response) return [null, new Error('No response')];
```

### Async Patterns
```typescript
// Parallel when independent
const [users, posts] = await Promise.all([
    fetchUsers(),
    fetchPosts()
]);

// Sequential when dependent
const [session, err1] = await login(credentials);
if (err1) return [null, err1];

const [data, err2] = await fetchData(session);
if (err2) return [null, err2];
```

## Import Conventions

```typescript
// External packages
import { Hono } from 'hono';
import { z } from 'zod';

// Internal - namespace for modules
import * as auth from './auth';
import * as adt from './adt';

// Internal - named for specific items
import { ClientConfig, AuthType } from '../types';
import { parseXml, buildUrl } from '../utils';

// Types only
import type { Context } from 'hono';
```

### Forbidden Import Patterns

**NEVER use inline imports for type assertions.** This is ugly and unreadable.

BAD:
```typescript
const config = data as import('../types').ClientConfig;  // FORBIDDEN
```

GOOD:
```typescript
import type { ClientConfig } from '../types';
const config = data as ClientConfig;
```

---

## API Endpoints (Server Mode)

### Session Management
- `POST /login` — Authenticate, returns session ID
- `DELETE /logout` — End session

### Metadata Discovery
- `GET /packages` — List available packages
- `POST /tree` — Hierarchical package browser
- `GET /transports/:package` — List transports

### CRAUD Operations
- `POST /objects/read` — Batch read with content
- `POST /objects/upsert/:package/:transport?` — Create/update objects
- `POST /objects/activate` — Activate objects
- `DELETE /objects/:transport?` — Delete objects

### Data Preview
- `POST /preview/data` — Query table/view data
- `POST /preview/distinct` — Distinct column values
- `POST /preview/count` — Row count

### Search
- `POST /search/:query` — Search objects
- `POST /where-used` — Find dependencies

---

## Testing

Run tests:
```bash
bun test                 # All tests
bun test --watch         # Watch mode
bun test src/__tests__/core  # Specific directory
```

Test Node.js compatibility before publishing:
```bash
node --experimental-strip-types -e "import('.')"
```

## Comments

Add comments for:
- Complex business logic
- Non-obvious implementations
- SAP/ADT-specific behavior
- Workarounds

```typescript
// NOTE: SAP requires CSRF token refresh after 401
// TODO: Implement retry logic
// FIXME: Temporary workaround for XML parsing issue
```

---

## SAP ADT Domain Knowledge

### Client ID Format

Client IDs follow: `SystemId-ClientNumber` (e.g., `MediaDemo-DM1-200`)
- `MediaDemo-DM1` → System ID (looks up URL in config.json)
- `200` → SAP client number (passed as `sap-client` query param)

Multiple SAP clients (100, 200, etc.) share the same server URL.

### Config File

`config.json` maps system IDs to URLs:
```json
{
    "MediaDemo-DM1": {
        "adt": "https://50.19.106.63:443"
    }
}
```

Use `loadConfigFromEnv()` which defaults to `./config.json` or reads from `RELAY_CONFIG` env var.

### CSRF Token Flow

1. First request sends header `x-csrf-token: fetch`
2. Server returns token in response header
3. All subsequent requests include that token
4. On 403 "CSRF token validation failed" → auto-refresh and retry

### SSL Verification

The Python reference disables SSL verification (`verify: False`). This is intentional for SAP systems with self-signed certs.

---

## TypeScript Gotchas (Lessons Learned)

### 1. `exactOptionalPropertyTypes` + Zod

Zod infers `prop?: string | undefined` but interfaces may expect `prop?: string`. Cast after validation:
```typescript
import type { ClientConfig } from '../types';
const validation = schema.safeParse(body);
const config = validation.data as ClientConfig;  // Cast needed
```

### 2. `process.env` Access

Use bracket notation for index signatures:
```typescript
// BAD - TS error with noUncheckedIndexedAccess
const path = process.env.RELAY_CONFIG;

// GOOD
const path = process.env['RELAY_CONFIG'];
```

### 3. Hono Status Codes

Hono's `c.json()` only accepts standard HTTP status codes. Non-standard codes like 440 cause TS errors:
```typescript
// BAD - 440 not in ContentfulStatusCode
return c.json({ error: 'Session expired' }, 440);

// GOOD - use standard code
return c.json({ error: 'Session expired', code: 'SESSION_EXPIRED' }, 401);
```

### 4. Middleware Return Types

Hono middleware must return after `await next()`:
```typescript
export const middleware = createMiddleware(async (c, next) => {
    await next();
    return;  // Required for TS
});
```

### 5. Literal Types in JSON Responses

Use `as const` for discriminated unions:
```typescript
return c.json({ success: false as const, error: msg }, 400);
```

---

## Architecture Decisions

### Why Error Tuples?

- Forces explicit error handling at call site
- No try/catch soup
- TypeScript narrows types after null check
- Matches Go idiom (familiar pattern)

### Why Separate core/ and server/?

- `core/` = pure functions, testable, library-consumable
- `server/` = HTTP concerns only (routes, middleware)
- Consumers can import `core/` directly without server overhead

### Why Config File Lookup?

Matches Python reference behavior. Allows:
- Single source of truth for system URLs
- Easy environment switching
- Client ID as simple string identifier

### Why One File Per Route?

Inspired by SNAP-API Python project:
- Easy to find/edit specific endpoints
- Colocated schemas prevent drift
- Clear ownership and responsibility
- Minimal merge conflicts

### Why One Function Per File (Core)?

- Clear import hierarchy
- No circular dependency risks
- Easy to test in isolation
- Self-documenting structure
