# Catalyst-Relay Development TODO

## Overview

This document outlines parallelizable work streams for porting SNAP-Relay-API to TypeScript.
Reference implementation: `C:\Artisan\SNAP\SNAP-Relay-API`

## Parallel Work Streams

Development is organized into independent streams that can be worked on simultaneously by different agents.

---

## Stream 1: Core Utilities (`src/core/utils/`)

**Dependencies**: None (leaf module)
**Reference**: `SNAP-Relay-API/snap_relay_api/clients/adt/utils/`

| Task | File | Description |
|------|------|-------------|
| XML Parser | `xml.ts` | Secure XML parsing with defusedxml equivalent. Parse ADT responses, extract lock handles, activation errors |
| URL Builder | `url.ts` | Build ADT endpoint URLs, handle path joining, query params |
| SQL Validator | `sql.ts` | SQL injection prevention, WHERE clause construction, dangerous pattern detection |
| CSRF Handler | `csrf.ts` | CSRF token fetch, cache, refresh logic |

**Tests**: `src/__tests__/core/utils/`

---

## Stream 2: Authentication (`src/core/auth/`)

**Dependencies**: Stream 1 (utils)
**Reference**: `SNAP-Relay-API/snap_relay_api/clients/base.py`, `cloud_configs.py`

| Task | File | Description |
|------|------|-------------|
| Auth Interface | `types.ts` | `AuthStrategy` interface, shared auth types |
| Basic Auth | `basic.ts` | Username/password authentication |
| SAML Auth | `saml.ts` | Headless browser login (Playwright/Puppeteer) |
| SSO Auth | `sso.ts` | Kerberos/Windows integrated auth |

**Tests**: `src/__tests__/core/auth/`

**Note**: Each auth strategy is independent and can be developed in parallel once the interface is defined.

---

## Stream 3: Session Management (`src/core/session/`)

**Dependencies**: None
**Reference**: `SNAP-Relay-API/snap_relay_api/apis/adt.py` (session store logic)

| Task | File | Description |
|------|------|-------------|
| Session Types | `types.ts` | Session config, session entry types |
| Session Manager | `manager.ts` | In-memory store, create/get/destroy sessions |
| Cleanup Task | `cleanup.ts` | Background interval cleanup (60s), timeout handling |
| Config Hashing | `hash.ts` | Hash client configs for deduplication |

**Tests**: `src/__tests__/core/session/`

---

## Stream 4: ADT Client Core (`src/core/client.ts`)

**Dependencies**: Streams 1, 2, 3
**Reference**: `SNAP-Relay-API/snap_relay_api/clients/adt/main.py`

| Task | Description |
|------|-------------|
| HTTP Layer | Base fetch wrapper with CSRF, error handling, retries |
| Request Builder | Build ADT requests with proper headers |
| Response Parser | Parse XML/JSON responses, normalize errors |
| Lock Manager | Object locking/unlocking for modifications |

**Tests**: `src/__tests__/core/client.test.ts`

---

## Stream 5: ADT Operations (`src/core/adt/`)

**Dependencies**: Stream 4
**Reference**: `SNAP-Relay-API/snap_relay_api/clients/adt/main.py`

These can be parallelized once the client core is ready:

| Task | File | Description |
|------|------|-------------|
| CRAUD | `craud.ts` | Create, Read, Activate, Update, Delete operations |
| Discovery | `discovery.ts` | Package listing, tree browsing, transport listing |
| Data Preview | `preview.ts` | Table/view queries, distinct values, row counts |
| Search | `search.ts` | Object search, where-used analysis |

**Tests**: `src/__tests__/core/adt/`

---

## Stream 6: Server Layer (`src/server/`)

**Dependencies**: Streams 4, 5
**Reference**: `SNAP-Relay-API/snap_relay_api/apis/adt.py`

| Task | File | Description |
|------|------|-------------|
| Session Middleware | `middleware/session.ts` | Validate `X-Session-ID` header |
| Error Middleware | `middleware/error.ts` | Standardize error responses |
| Auth Routes | `routes/auth.ts` | `POST /login`, `DELETE /logout` |
| Object Routes | `routes/objects.ts` | CRAUD endpoints |
| Preview Routes | `routes/preview.ts` | Data preview endpoints |
| Search Routes | `routes/search.ts` | Search endpoints |
| Discovery Routes | `routes/discovery.ts` | Package/tree/transport endpoints |

**Tests**: `src/__tests__/server/`

---

## Dependency Graph

```
Stream 1 (Utils) ─────────────────┐
                                  │
Stream 2 (Auth) ──────────────────┼──► Stream 4 (Client) ──► Stream 5 (ADT Ops) ──► Stream 6 (Server)
                                  │
Stream 3 (Session) ───────────────┘
```

**Parallel Phase 1** (no dependencies):
- Stream 1: Utils
- Stream 3: Session Management

**Parallel Phase 2** (after Phase 1):
- Stream 2: Authentication (needs utils)
- Stream 4: Client Core (needs utils, session)

**Parallel Phase 3** (after Phase 2):
- Stream 5: ADT Operations (all can run in parallel)

**Final Phase**:
- Stream 6: Server Layer

---

## Agent Instructions

### Starting a Stream

1. Read the reference Python implementation
2. Check `src/types/` for existing type definitions
3. Follow code style in `.claude/CLAUDE.md` (guard clauses, error tuples)
4. Write tests alongside implementation
5. Export from the module's `index.ts`

### Code Style Reminders

```typescript
// Always use Result tuples
type Result<T, E = Error> = [T, null] | [null, E];

// Always use guard clauses
if (!data) return [null, new Error('No data')];

// Import patterns
import type { SomeType } from '../types';
import { ok, err } from '../types/result';
```

### Testing

```bash
bun test src/__tests__/core/utils  # Test specific module
bun test --watch                    # Watch mode
```

---

## Priority Order

1. **High**: Stream 1 (Utils) - Blocks everything
2. **High**: Stream 3 (Session) - Blocks client
3. **Medium**: Stream 2 (Auth/Basic) - Start with basic auth only
4. **Medium**: Stream 4 (Client Core) - Central piece
5. **Medium**: Stream 5 (ADT/CRAUD) - Core functionality
6. **Low**: Stream 5 (ADT/Preview, Search) - Secondary features
7. **Low**: Stream 6 (Server) - Wrapper layer
8. **Low**: Stream 2 (Auth/SAML, SSO) - Advanced auth

---

## Completion Checklist

- [x] Stream 1: Core Utilities
  - [x] XML parser (`xml.ts`)
  - [x] URL builder (`url.ts`)
  - [x] SQL validator (`sql.ts`)
  - [x] CSRF handler (`csrf.ts`)
- [x] Stream 2: Authentication
  - [x] Auth interface (`types.ts`)
  - [x] Basic auth (`basic.ts`)
  - [x] SAML auth (placeholder - `saml.ts`)
  - [x] SSO auth (placeholder - `sso.ts`)
  - [x] Auth factory (`factory.ts`)
- [x] Stream 3: Session Management
  - [x] Session types (`types.ts`)
  - [x] Session manager (`manager.ts`)
  - [x] Cleanup task (`cleanup.ts`)
  - [x] Config hashing (`hash.ts`)
- [x] Stream 4: ADT Client Core
  - [x] HTTP layer
  - [x] Request builder
  - [x] CSRF token management
  - [x] Login/Logout
- [x] Stream 5: ADT Operations
  - [x] Object types config (`types.ts`)
  - [x] CRAUD operations (`craud.ts`)
  - [x] Discovery (`discovery.ts`)
  - [x] Data preview (`preview.ts`)
  - [x] Search (`search.ts`)
- [x] Stream 6: Server Layer
  - [x] Session middleware (`middleware/session.ts`)
  - [x] Error middleware (`middleware/error.ts`)
  - [x] Auth routes (`routes/auth.ts`)
  - [x] Object routes (`routes/objects.ts`)
  - [x] Discovery routes (`routes/discovery.ts`)
  - [x] Preview routes (`routes/preview.ts`)
  - [x] Search routes (`routes/search.ts`)
  - [x] Server entry (`server.ts`)
- [ ] Integration tests (requires live SAP system)
- [x] Node.js compatibility test ✓
