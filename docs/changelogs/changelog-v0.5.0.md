# Changelog - v0.5.0

## Release Date
January 27, 2026

## Overview
Adds session state export/import for cross-process session sharing and refactors the ADT client into a modular architecture for better maintainability.

## Breaking Changes
None.

## What's New

### Session State Export/Import

New methods on `ADTClient` allow authenticated sessions to be serialized and restored across processes:

```typescript
// Export session from a daemon process
const state = client.exportSessionState();
// Returns ExportableSessionState | null

// Import into a CLI process
const [success, error] = await client.importSessionState(state);
```

This enables Catalyst-CLI to reuse authenticated sessions from a background daemon without re-authenticating. The import validates that the session hasn't expired and performs a lightweight request to confirm the session is still valid on the SAP server.

**Supported auth types:**
- Basic auth: Exports CSRF token, session info, and cookies
- SAML auth: Same as basic
- SSO auth: Exports certificate paths (not contents) for security; certificates are re-read on import

### Modular Client Architecture

The ADT client has been reorganized from a single 755-line file into a clean modular structure. This is an internal refactoring with no changes to the public API.

**New structure:**
```
src/client/
├── client.ts              # ADTClient interface and implementation
├── index.ts               # createClient factory
├── types.ts               # Internal types (ClientState, ClientContext)
├── helpers.ts             # HTTP utilities (httpRequest, URL building)
└── methods/
    ├── lifecycle/         # login, logout, refreshSession
    ├── session/           # exportSessionState, importSessionState
    ├── craud/             # read, create, update, upsert, activate, delete
    ├── discovery/         # getPackages, getTree, getPackageStats, getTransports
    ├── preview/           # previewData, getDistinctValues, countRows
    ├── search/            # search, whereUsed
    ├── transport/         # createTransport
    ├── diff/              # gitDiff
    ├── config/            # getObjectConfig
    └── internal/          # cookies, autoRefresh, request execution
```

Each method is now in its own file, making the codebase easier to navigate, test, and maintain.

## Technical Details

### New Types

**ExportableSessionState** (`src/core/session/types.ts`):
```typescript
interface ExportableSessionState {
    csrfToken: string;
    session: Session;
    cookies: Array<{ name: string; value: string }>;
    authType: AuthType;
    ssoCertPaths?: { fullChainPath: string; keyPath: string };
}
```

**ClientContext** (`src/client/types.ts`):
Internal context object passed to extracted method functions, providing access to state and bound helper methods.

### Import Validation

When importing a session, the client:
1. Checks if the session has expired locally
2. Restores CSRF token, session, and cookies
3. For SSO, reloads certificates from the stored paths
4. Makes a lightweight request to `/sap/bc/adt/compatibility/graph` to validate the session is still active
5. Starts auto-refresh if enabled in config

If validation fails, the session state is cleared and an error is returned.

### Files Changed

**New files (41):**
- `src/client/client.ts` - ADTClient implementation
- `src/client/index.ts` - createClient factory export
- `src/client/types.ts` - Internal type definitions
- `src/client/helpers.ts` - HTTP request utilities
- `src/client/methods/**/*.ts` - All extracted method files

**Modified files:**
- `src/core/index.ts` - Re-exports from new client location
- `src/core/session/types.ts` - Added ExportableSessionState
- `src/index.ts` - Added ExportableSessionState export

**Deleted files:**
- `src/core/client.ts` - Replaced by modular client structure

## Commits Included
- dd513aa - [UPDATE] Adding new import/export methods for session state, to be used by Catalyst-CLI
- ab73d19 - [UPDATE] Breaking apart the client god file
- 56b2e1c - [UPDATE] Moving Client out
