# Catalyst-Relay

TypeScript port of SNAP-Relay-API — middleware bridging frontend applications to SAP ADT (ABAP Development Tools) servers.

IMPORTANT: Use /typescript:write-typescript before editing any typescript files.
use /developer:debug-issue before trying to debug anything.
Use /run-tests before doing any test validation.

## Quick Reference

| Item | Value |
|------|-------|
| Runtime | Bun (dev) / Node.js (library consumers) |
| Framework | Hono |
| Validation | Zod |
| Testing | Vitest |
| Build | tsup |
| SAML Auth | Playwright (optional peer dep) |
| SSO Auth | kerberos (optional peer dep, Windows-focused) |

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
│   │   ├── index.ts      # Barrel exports
│   │   ├── types.ts      # Shared auth types (AuthStrategy, AuthCookie)
│   │   ├── factory.ts    # Auth strategy factory
│   │   ├── basic/        # Basic auth (username/password)
│   │   │   ├── index.ts
│   │   │   └── basic.ts
│   │   ├── saml/         # SAML auth (browser automation)
│   │   │   ├── index.ts
│   │   │   ├── saml.ts       # SamlAuth class
│   │   │   ├── browser.ts    # Playwright login flow
│   │   │   ├── cookies.ts    # Cookie extraction
│   │   │   └── types.ts      # SAML types and defaults
│   │   └── sso/          # SSO auth (Kerberos, placeholder)
│   │       ├── index.ts
│   │       └── sso.ts
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
├── craud/                # Create, Read, Activate, Update, Delete
│   ├── read.ts           → readObject()
│   ├── create.ts         → createObject()
│   ├── update.ts         → updateObject()
│   ├── delete.ts         → deleteObject()
│   ├── lock.ts           → lockObject(), unlockObject()
│   ├── activation.ts     → activateObjects()
│   └── gitDiff.ts        → gitDiff()
│
├── discovery/            # Package/tree browsing, search, where-used
│   ├── packages.ts       → getPackages()
│   ├── tree.ts           → getTree()
│   ├── searchObjects.ts  → searchObjects()
│   └── whereUsed.ts      → findWhereUsed()
│
├── data_extraction/      # Data preview, counts, distinct values
│   ├── dataPreview.ts    → previewData()
│   ├── distinct.ts       → getDistinctValues()
│   ├── count.ts          → countRows()
│   ├── queryBuilder.ts   → buildSQLQuery() (optional helper)
│   └── previewParser.ts  # Internal parser (not exported)
│
└── transports/           # Transport request management
    ├── transports.ts     → getTransports()
    └── createTransport.ts → createTransport()
```

### Import Hierarchy

Files should have a clear traceable import hierarchy with no circular dependencies:

```
types.ts           (shared types, no imports from package)
    ↓
helpers.ts         (internal utilities, imports types)
    ↓
subfolder files    (import ../types and ../helpers)
    ↓
index.ts           (barrel exports, imports from subfolders)
```

Subfolder files use relative paths to reach shared resources:
- `../types` for shared types
- `../helpers` for shared helpers
- `../../utils/xml` for core utilities
- `../../../types/result` for global types

---

## TypeScript Gotchas

Project-specific TypeScript issues discovered while building Catalyst-Relay.

### exactOptionalPropertyTypes + Zod

Zod infers `prop?: string | undefined` but interfaces may expect `prop?: string`. Cast after validation.

```typescript
// BAD - type mismatch with exactOptionalPropertyTypes
const config = schema.parse(body);  // Zod adds | undefined to optional props

// GOOD - cast to your interface after validation
import type { ClientConfig } from '../types';
const validation = schema.safeParse(body);
const config = validation.data as ClientConfig;
```

### process.env Access

Use bracket notation for index signatures with `noUncheckedIndexedAccess`.

```typescript
// BAD - TS error with noUncheckedIndexedAccess
const path = process.env.RELAY_CONFIG;

// GOOD - bracket notation works
const path = process.env['RELAY_CONFIG'];
```

### Hono Status Codes

Hono's `c.json()` only accepts standard HTTP status codes. Non-standard codes like 440 cause TS errors.

```typescript
// BAD - 440 not in ContentfulStatusCode
return c.json({ error: 'Session expired' }, 440);

// GOOD - use standard code with error code in body
return c.json({ error: 'Session expired', code: 'SESSION_EXPIRED' }, 401);
```

### Middleware Return Types

Hono middleware must explicitly return after `await next()`.

```typescript
// BAD - implicit return causes TS error
export const middleware = createMiddleware(async (c, next) => {
    await next();
});

// GOOD - explicit return
export const middleware = createMiddleware(async (c, next) => {
    await next();
    return;  // Required for TS
});
```

### Literal Types in JSON Responses

Use `as const` for discriminated unions in response objects.

```typescript
// BAD - success inferred as boolean, not literal false
return c.json({ success: false, error: msg }, 400);

// GOOD - literal type preserved
return c.json({ success: false as const, error: msg }, 400);
```

---

## Architecture Decisions

### Why Error Tuples?

Go-style `[result, error]` tuples instead of try/catch:

- Forces explicit error handling at call site
- No try/catch soup
- TypeScript narrows types after null check

```typescript
const [client, error] = await createClient(config);
if (error) return handleError(error);
// client is guaranteed non-null here
```

### Why Separate core/ and server/?

- `core/` = pure functions, testable, library-consumable
- `server/` = HTTP concerns only (routes, middleware)
- Consumers can import `core/` directly without server overhead

### Why One File Per Route/Function?

- Easy to find/edit specific code
- Colocated schemas prevent drift
- Clear ownership and minimal merge conflicts

---

## Reference Documentation

| Document | Purpose |
|----------|---------|
| `docs/api-reference.md` | HTTP endpoints overview (Server Mode) |
| `docs/endpoints/` | In-depth endpoint documentation with examples |
| `docs/sap-adt.md` | SAP ADT domain knowledge (CSRF tokens, SSL) |

---

## Claude-Specific Rules

### Shell Commands

- **Do NOT use `/d` with `cd` commands** — It doesn't work on this machine. Use plain `cd` or run commands directly with absolute paths.

### TypeScript Errors

- **Always resolve ALL TypeScript errors** — Even if errors are unrelated to your changes, you must fix them before completing your task. Run `bun run typecheck` and ensure it passes with zero errors.

---

