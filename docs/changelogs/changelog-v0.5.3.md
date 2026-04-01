# Changelog - v0.5.3

## Release Date
April 1, 2026

## Overview
Adds syntax checking for ABAP objects (enabling AI agents to validate code before activation), fixes package description fetching, and improves the testing infrastructure to prevent user lockouts.

## Breaking Changes

### `getPackages` Signature Change

The `getPackages` method signature changed from a positional string parameter to an options object:

```typescript
// Before (v0.5.2)
const [packages, err] = await client.getPackages('Z*');

// After (v0.5.3)
const [packages, err] = await client.getPackages({ filter: 'Z*' });

// With descriptions (new)
const [packages, err] = await client.getPackages({ filter: 'Z*', includeDescriptions: true });
```

**Migration:** Replace any `getPackages(filter)` calls with `getPackages({ filter })`. Calls with no arguments (`getPackages()`) continue to work unchanged.

**Server mode:** The `GET /packages` endpoint now accepts an optional `includeDescriptions=true` query parameter.

## What's New

### Syntax Check (`checkSyntax`)

Check ABAP objects for syntax errors and warnings without activating them. Designed to enable AI agents using Catalyst-CLI to validate generated code before committing to activation.

```typescript
const [results, err] = await client.checkSyntax([
    { name: 'ZMYPROGRAM', extension: 'asprog' }
]);

// Each result contains status and detailed messages
for (const result of results) {
    console.log(`${result.name}: ${result.status}`);  // 'success' | 'warning' | 'error'
    for (const msg of result.messages) {
        console.log(`  [${msg.severity}] ${msg.text} (line ${msg.line}, col ${msg.column})`);
    }
}
```

- Works with all supported object types (CDS views, access controls, tables, structures, classes, programs)
- Returns error/warning messages with line and column positions
- Reads source from SAP and sends it inline (base64) via the ADT check run API
- Server mode: `POST /objects/check`

### Package Description Fetching Fix

Package descriptions were not being returned by the SAP quickSearch API. The `getPackages` method now enriches results via the virtualfolders API when `includeDescriptions: true` is set. Gracefully falls back to name-only results if description lookup fails.

### Testing Infrastructure Improvements

Resolved an issue where integration tests were locking out SAP users due to credential handling and session management problems:

- Test credentials can now be resolved from the OS keyring via `@napi-rs/keyring`, matching Catalyst-CLI's storage format (`SAP_TEST_SYSTEM_ALIAS` env var)
- Centralized `createTestClient` and `safeLogout` helpers replace duplicated setup/teardown code across test files
- All integration test suites now use shared helpers consistently

## Technical Details

### New Files
- `src/core/adt/craud/syntaxCheck.ts` — Core syntax check implementation with XML request building and response parsing
- `src/client/methods/craud/checkSyntax.ts` — Client method wrapper
- `src/server/routes/objects/check.ts` — `POST /objects/check` route handler
- `src/__tests__/integration/syntax-check-errors-workflow.test.ts` — Integration tests for error detection

### Modified Files
- `src/client/client.ts` — Added `checkSyntax` method, updated `getPackages` signature
- `src/core/adt/discovery/packages.ts` — Refactored to options object, added description enrichment via `getPackageStats`
- `src/core/adt/index.ts` — Exported `CheckResult`, `GetPackagesOptions`, `checkSyntax`
- `src/server/routes/index.ts` — Wired `POST /objects/check` route
- `src/server/routes/discovery/packages.ts` — Added `includeDescriptions` query param
- `src/types/responses.ts` — Added `CHECK_FAILED` error code
- `src/__tests__/integration/test-helpers.ts` — Added keyring credential resolution, `generateTestName`, `safeDelete`
- `src/__tests__/integration/cds-workflow.test.ts` — Migrated to shared helpers, added syntax check step
- `src/__tests__/integration/discovery-workflow.test.ts` — Updated to new `getPackages` signature
- `src/__tests__/integration/{abap-class,abap-program,table}-workflow.test.ts` — Added syntax check steps

## Commits Included
- 4b358ea - [UPDATE] Improving the testing infrastructure, which kept locking my users
- c472f11 - [UPDATE] Fixing fetching package descriptions
- 448c767 - [UPDATE] Syntax error and warning extraction
