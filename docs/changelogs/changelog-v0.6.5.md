# Changelog - v0.6.5

## Release Date
June 22, 2026

## Overview
Adds the ability to read, release, and unrelease the **C1 API release contract** of CDS DDL sources (DDLS) directly from the relay. This lets a frontend release workflow publish/unpublish a CDS query API without dropping into SAP ADT/Eclipse.

## Breaking Changes
None. All additions are net-new functions, types, and routes; no existing signatures changed.

## What's New

### API release / unrelease for CDS views

Three new capabilities operate on the C1 (customer / SAP Cloud Platform) contract of a CDS DDL source:

- **Read the release state** — get the current C1 status, its human-readable description, the states it can transition to, and (when present) who last changed it and when.
- **Release** — promote the contract to `RELEASED`.
- **Unrelease** — revert the contract to `NOT_RELEASED`.

These power a frontend release workflow: the UI can show whether a CDS query is released and flip that state on demand.

#### Validation runs before every state change

SAP performs a release/unrelease as two server-side steps, and the relay mirrors that:

1. **Validation run (pre-flight).** Before mutating anything, the relay POSTs a contract-validation request and parses the messages SAP returns.
2. **State change (PUT).** Only if the validation produced no **error**-severity messages does the relay perform the actual PUT.

This means a release that SAP would reject (e.g. a blocking dependency problem) fails *before* any change is made, with the error text surfaced to the caller — rather than leaving the object in a half-changed state.

#### How validation messages are handled

The validation run can return three severities (mapped from SAP message types: `E`/`A`/`X` → error, `W` → warning, anything else → info):

- **Errors** abort the operation before the PUT. Their text is combined into the returned `Error`.
- **Warnings and info** (e.g. "referenced data element is not released") are **non-blocking**. They are carried through in `ApiReleaseResult.messages` and returned to the caller — including over HTTP in `data.messages` — so a frontend can surface them to the user for review even though the release succeeded.

Consumers should display the returned `messages` to the user; a non-empty `messages` array on a successful release is informational, not a failure.

### New HTTP endpoints (Server Mode)

All require an authenticated session. `:name` is the DDLS object name (case-insensitive).

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api-release/:name` | Read the current C1 release state |
| `POST` | `/api-release/:name/release` | Release (→ `RELEASED`) |
| `POST` | `/api-release/:name/unrelease` | Unrelease (→ `NOT_RELEASED`) |

The release/unrelease bodies accept an optional `{ "transport": "..." }`. Transport may be omitted for local (non-transportable) objects.

### New library API (Library Mode)

The `ADTClient` interface gains three methods:

```typescript
client.getApiReleaseState(objectName: string): AsyncResult<ApiReleaseState>;
client.releaseApi(objectName: string, transport?: string): AsyncResult<ApiReleaseResult>;
client.unreleaseApi(objectName: string, transport?: string): AsyncResult<ApiReleaseResult>;
```

The following types are now re-exported from `catalyst-relay`:
`ApiReleaseState`, `ApiReleaseResult`, `ApiReleaseStatus`, `ApiReleaseValidationMessage`.

## Technical Details

### New module — `src/core/adt/craud/apirelease/`

- `types.ts` — `ApiReleaseStatus` (`NOT_RELEASED` | `RELEASED` | `DEPRECATED` | `NOT_TO_BE_RELEASED` | `NOT_TO_BE_RELEASED_STABLE`), `ApiReleaseState`, `ApiReleaseResult`, `ApiReleaseValidationMessage`.
- `getState.ts` — `getApiReleaseState()`: GETs the apirelease resource and parses the current C1 state.
- `release.ts` — `releaseApi()` / `unreleaseApi()`, both delegating to an internal `setApiReleaseState()` that runs validation → aborts on errors → PUTs → parses the resulting state.
- `helpers.ts` — path/body construction and XML parsing (not exported from the `adt/` barrel):
  - Operates exclusively on the **C1** contract of CDS **DDLS** (`ddic/ddl/sources`).
  - `buildApiReleasePath()` embeds the URL-encoded releasable-object URI as a single path segment under `/sap/bc/adt/apireleases/`; `buildContractPath()` and `buildValidationRunPath()` extend it with `/c1` and `/c1/validationrun`.
  - `parseReleaseState()` locates the correct `<ars:c1Release>` element (skipping the homonymous element inside `<ars:behaviour>`, which carries no `<ars:status>`), and reads status, description, and allowed transitions.
  - `parseValidationMessages()` / `collectErrors()` / `mapSeverity()` parse and triage the validation-run messages.

### Media types

Documented and used on the wire (consistent with what ADT/Eclipse negotiates):

- `application/vnd.sap.adt.apirelease.v10+xml` — apirelease resource (GET and PUT). The **v10** version matters: the `v6` advertised in older responses' atom-link `type` attributes selects a stale server-side schema.
- `application/vnd.sap.adt.apireleasecontractvalidation+xml` — validation-run request body.
- Validation `Accept`: `...apireleasecontractvalidation+xml, ...apireleasecontractvalidation.v2+xml`.

### Wiring

- `src/client/methods/apirelease/` — client-method wrappers (login guard + delegation to core).
- `src/client/client.ts` — three methods added to the `ADTClient` interface and `ADTClientImpl`.
- `src/core/adt/index.ts` and `src/index.ts` — re-export the functions and the four public types.
- `src/server/routes/apirelease/` + `src/server/routes/index.ts` — the three session-guarded routes.

### Tests

- `src/__tests__/core/adt/craud/apirelease/helpers.test.ts` — unit coverage for path/body construction and XML parsing.
- `src/__tests__/integration/upsert-workflow.test.ts` — extended to exercise the release workflow.

## Commits Included
- 587e92c - [UPDATE] Release and unrelease API state for CDS views
