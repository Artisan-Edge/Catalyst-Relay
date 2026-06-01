# Changelog - v0.5.14

## Release Date
June 1, 2026

## Overview
Adds a freestyle OpenSQL data-preview endpoint (and matching client method), per-request timeouts, and richer transport-task metadata. Also hardens freestyle queries against ABAP work-process subpool exhaustion, makes data-preview column typing far more robust, and surfaces real error messages from the server instead of a generic 500.

## What's New

### Freestyle OpenSQL query (`POST /preview/freestyle` + `client.freestyleQuery()`)
Consumers can now run arbitrary OpenSQL `SELECT` statements against the connected SAP system instead of being limited to the structured table/view preview, distinct, and count operations.

**HTTP:**
```http
POST /preview/freestyle
{
  "sqlQuery": "SELECT carrid, connid, fldate FROM sflight WHERE carrid = 'LH'",
  "limit": 500,      // optional, 1..50000 (core default 100)
  "timeout": 60000   // optional, ms, 1..300000 (5 min cap)
}
```
Returns a `DataFrame` (`{ columns, data }`) — the same shape returned by `previewData`.

**Library:**
```typescript
const [frame, error] = await client.freestyleQuery(sqlQuery, limit, timeout);
```

> **Note — power-user / read-only surface.** This endpoint executes whatever OpenSQL it is given as a read-only data preview, intended for advanced and internal use. It is bounded by the row `limit` (max 50,000) and the per-request `timeout` (max 5 minutes), but it does not parse or restrict the query beyond that. Callers are responsible for deciding who is allowed to issue arbitrary SQL.

### Per-request timeouts
`RequestOptions` (and the `AdtRequestor` contract) now accept an optional `timeout`. When provided it overrides the client-wide `config.timeout` for that single request; otherwise the existing `config.timeout` / `DEFAULT_TIMEOUT` behavior is unchanged. This is what lets a long-running freestyle query wait longer than the global default without raising the timeout for every other call.

### Task owner, description, and status on `TaskContents`
`parseTransportTasks` now reads the `tm:owner`, `tm:desc`, and `tm:status` attributes on each `tm:task` element and exposes them as optional fields on `TaskContents`:

- **Task owner** — often differs from the parent transport owner (SAP's multi-developer workflow assigns sub-tasks to different users).
- **Task description** — the free-text label set by the task owner (e.g. "Header view work").
- **Task status** — single-letter SAP code (`D` modifiable, `R` released, etc.).

Fields are optional: present (as a string) when SAP returns a value, absent otherwise. Empty-string attributes are treated as absent, so callers never have to distinguish missing-vs-empty.

### More robust data-preview column typing
`parseDataPreview` previously dropped any column whose metadata lacked an explicit `colType` attribute — which happens on aggregate and freestyle result sets. Column types are now resolved by priority:

1. Explicit dictionary `colType` (e.g. `CHAR`, `DATS`) when present.
2. Key figures (`isKeyFigure="true"`) → `decimal`.
3. SAP raw `type` code mapped via a lookup table (`I`/`8` → `integer`, `P`/`F` → `decimal`/`float`, `D`/`T`/`S` → `date`/`time`/`timestamp`, `C`/`N`/`V` → `string`, `X` → `binary`).
4. Fallback → `string`.

The result is that freestyle and aggregate queries return correctly-typed columns instead of silently losing them.

### Richer server error responses
The server's global `onError` handler now:
- Recognizes thrown `ApiError`s and returns their `statusCode`, `code`, and `details` instead of flattening everything to a 500.
- Surfaces the actual error message for unhandled errors (still `code: UNKNOWN_ERROR`, HTTP 500) rather than the opaque `"Internal server error"`.

Freestyle query failures also now carry the raw SAP response body on the error's `cause`, so the original ABAP error text reaches the caller.

## Reliability Fix

### ABAP subpool exhaustion on repeated freestyle queries
Freestyle queries now send `X-sap-adt-sessiontype: stateless`, overriding the stateful session header used elsewhere. Each preview request is independent, so stateless lets SAP route to any work process and recycle it after the request. This prevents `GENERATE_SUBPOOL_DIR_FULL` — SAP's 36-subpool-per-work-process limit — which could otherwise be hit by issuing many freestyle queries against the same stateful work process.

## Technical Details

- `src/core/adt/data_extraction/freestyle.ts` — `freestyleQuery()` gained an optional `timeout`, sends the stateless session header, and wraps failures with `{ cause: <raw response text> }`.
- `src/client/methods/preview/freestyleQuery.ts` (new) — client wrapper; returns `err(new Error('Not logged in'))` when there is no session, otherwise delegates to `adt.freestyleQuery`. Re-exported from `core/adt/index.ts` and the preview method barrel; reachable on the `ADTClient` interface as `freestyleQuery(sqlQuery, limit?, timeout?)`.
- `src/server/routes/preview/freestyle.ts` (new) — `POST /preview/freestyle` handler with a colocated Zod schema (`sqlQuery: min(1)`, `limit: positive().max(50000)`, `timeout: positive().max(300000)`), wired into `server/routes/index.ts`.
- `src/client/types.ts` + `src/core/adt/types.ts` — `RequestOptions` / `AdtRequestor.request` gained optional `timeout`; `executeRequest` now uses `requestTimeout ?? config.timeout ?? DEFAULT_TIMEOUT` on both the initial request and the CSRF-retry request.
- `src/core/adt/data_extraction/previewParser.ts` — added `SAP_TYPE_MAP` and the priority-based `dataType` resolution described above.
- `src/core/adt/transports/parseTransportTasks.ts` — extended `TaskContents` with optional `owner`/`description`/`status`, populated with the `...(value ? { key: value } : {})` pattern to honor `exactOptionalPropertyTypes`.
- `src/server.ts` — `onError` handles `ApiError` and echoes real error messages.

## Backwards Compatibility
No breaking changes.

- The new `freestyleQuery` client method and `/preview/freestyle` route are additive; existing endpoints and methods are unchanged.
- `timeout` is optional everywhere; requests that omit it behave exactly as before.
- The new `TaskContents` fields are optional, so existing `{ taskId, objects }` literals continue to compile and run.
- Data-preview parsing only *adds* columns that were previously dropped; columns that already parsed are unaffected.

## Commits Included
- a023e10 — feat: add POST /preview/freestyle endpoint for arbitrary OpenSQL
- 2bf667b — [UPDATE] add per-request timeout to freestyle endpoint
- 15a227c — [FIX] prevent ABAP subroutine pool exhaustion on freestyle queries
- 915e7c6 — Bug fix (data-preview column typing + server error handler)
- e1ef949 — [ADD] task owner, description, status to TaskContents parser
- ed6972c — [UPDATE] Added freestyle to endpoint docs
- 9088175 / cbec1fe — console.log and comment cleanup
