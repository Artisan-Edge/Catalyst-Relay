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

## Required Reading

> **⛔ STOP — DO NOT MODIFY CODE UNTIL YOU HAVE READ THESE DOCS**
>
> This is not optional. You MUST read these documents before making ANY code changes.
> If you skip this step, you WILL introduce anti-patterns that violate project standards.
> The user will ask if you read these docs. Be honest.

| Document | Purpose |
|----------|---------|
| `.claude/docs/code-smell.md` | **CRITICAL** — Anti-patterns to avoid (bloated types, nested conditionals, etc.) |
| `.claude/docs/typescript-patterns.md` | Naming, types, imports, async conventions |
| `.claude/docs/lessons-learned.md` | TypeScript gotchas and architecture decisions |

**Read these files using the Read tool before writing any code.** Planning a refactor? Read first. Fixing a bug? Read first. Adding a feature? Read first.

Violations of documented patterns will be called out immediately and you will be asked to redo the work.

---

## Situational Reading

If requested to do any tasks or answer questions, be aware of these resources. Use if pertinent:

| Document | Purpose |
|----------|---------|
| `.claude/docs/api-reference.md` | HTTP endpoints overview (Server Mode) |
| `.claude/docs/endpoints/` | In-depth endpoint documentation with examples |
| `.claude/docs/testing.md` | Running unit and integration tests |
| `.claude/docs/sap-adt.md` | SAP ADT domain knowledge |

### Endpoint Documentation Pattern

The `.claude/docs/endpoints/` folder contains detailed documentation for each endpoint category. Each file follows this consistent structure:

1. **Title** — Category name (e.g., "Authentication Endpoints")
2. **Sections TOC** — Always include `## Sections` with anchor links to all sections
3. **Per-Endpoint Structure:**
   - Description paragraph
   - Request table (Method, Path, Auth Required)
   - Request Body table (Field, Type, Required, Description)
   - Response table (Field, Type, Description)
   - Example request/response JSON
   - Error codes table
   - Use cases list

**IMPORTANT:** All documentation files must include a `## Sections` table of contents at the top with anchor links to each section.

---

## Claude-Specific Rules

### Shell Commands

- **Do NOT use `/d` with `cd` commands** — It doesn't work on this machine. Use plain `cd` or run commands directly with absolute paths.

### TypeScript Errors

- **Always resolve ALL TypeScript errors** — Even if errors are unrelated to your changes, you must fix them before completing your task. Run `bun run typecheck` and ensure it passes with zero errors.

---

