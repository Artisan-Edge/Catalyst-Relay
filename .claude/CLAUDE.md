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

## Required Reading

**BEFORE modifying any code**, read these docs:

| Document | Purpose |
|----------|---------|
| `.claude/docs/code-smell.md` | Anti-patterns to avoid |
| `.claude/docs/typescript-patterns.md` | Naming, types, imports, async |
| `.claude/docs/lessons-learned.md` | TypeScript gotchas and architecture decisions |

Violations of documented patterns will be called out immediately.

---

## Situational Reading

If requested to do any tasks or answer questions, be aware of these resources. Use if pertinent:

| Document | Purpose |
|----------|---------|
| `.claude/docs/api-reference.md` | HTTP endpoints (Server Mode) |
| `.claude/docs/testing.md` | Running unit and integration tests |
| `.claude/docs/sap-adt.md` | SAP ADT domain knowledge |

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
