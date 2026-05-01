# Changelog - v0.5.11

## Release Date
May 1, 2026

## Overview
Replaces serial deletion with dependency-aware multi-delete, fixes a correctness bug where activations could be reported as successful before SAP had actually finished activating, and adds support for ABAP Includes.

## Breaking Changes

### `client.delete()` return type
The `delete()` method on `ADTClient` now returns `AsyncResult<DeleteResult[]>` instead of `AsyncResult<void>`. Each entry reports per-object `status` (`'success' | 'error'`) and an optional `message`. Partial failures no longer abort the batch — every object is attempted and the caller inspects the result array.

**Before:**
```typescript
const [, error] = await client.delete(objects, transport);
if (error) handleError(error);
```

**After:**
```typescript
const [results, error] = await client.delete(objects, transport);
if (error) handleError(error);            // top-level failure (e.g. external refs)
const failed = results.filter(r => r.status === 'error');
```

### `DELETE /objects/:transport` response shape
The HTTP endpoint's `data` field changed from `null` to `DeleteResult[]` with the same per-object shape described above.

### New `EXTERNAL_REFERENCES` (HTTP 409) error
If any object in the deletion set is referenced by an object **outside** the set, the operation is refused before any deletes are attempted. Library callers receive an `ExternalReferencesError` with a `references: ExternalReference[]` field; HTTP callers receive:

```json
{
  "success": false,
  "error": "Cannot delete: N external reference(s) prevent the operation",
  "code": "EXTERNAL_REFERENCES",
  "references": [{ "object": { "name": "...", "extension": "..." },
                   "referencedBy": { "name": "...", "extension": "..." } }]
}
```

The `references` payload is intended to be surfaced to the end-user so they can decide whether to extend the deletion set and retry. There is no force/cascade flag — extending the set is the only path forward.

## What's New

### Multi-delete with dependency ordering
Deleting multiple objects now runs a where-used analysis on each object up front and orders the actual deletions so that referencers are deleted before their referents. Independent objects are deleted in parallel; dependent objects are sequenced into waves. This removes a class of failures where a delete would be rejected because another object in the same batch still depended on it.

### Activation correctness fix
`activateObjects()` previously used a single `POST /sap/bc/adt/activation` call and returned as soon as that POST replied. On some SAP servers the POST returned before activation had actually finished, so callers received a "success" response for objects that were still inactive (or had silently failed activation). The implementation now follows SAP's run-based flow:

1. `POST /sap/bc/adt/activation/runs` — start the run, capture the run ID from the `Location` header
2. `GET /sap/bc/adt/activation/runs/{id}?withLongPolling=true` — block until the run completes (with retry up to 30 attempts)
3. `GET /sap/bc/adt/activation/results/{id}` — fetch the final results

Activation responses now reflect the true post-activation state of the objects.

As a side-benefit, the new flow accepts mixed extensions in a single batch — you can activate a DDLS, a class, and an include in one call. The previous `'All objects must have the same extension for batch activation'` restriction is gone.

### ABAP Include support (`asinc`)
ABAP Include objects (`PROG/I`) can now be uploaded, read, deleted, and activated through the same code paths as other object types. The new extension is `asinc`; the SAP endpoint is `programs/includes`.

## Technical Details

- **New core module** `src/core/adt/craud/multiDelete.ts` exporting `multiDeleteObjects()`, `DeleteResult`, `ExternalReference`, and `ExternalReferencesError`. Uses Kahn's algorithm over a referencer graph built from parallel `findWhereUsed()` calls; each wave's deletes run in parallel via `Promise.all`. Cycles among in-set objects are handled best-effort by running all remaining nodes as a final wave.
- **`activation.ts` rewritten** around the runs/results endpoints. Constants: `MAX_POLL_ATTEMPTS = 30`, `RUN_ID_REGEX = /\/activation\/runs\/([^?/]+)/`. The `_extension` parameter on `extractActivationErrors` was removed (no longer needed after dropping the same-extension constraint).
- **`OBJECT_CONFIG_MAP`** gained an `'asinc'` entry; `ConfiguredExtension` and `ObjectTypeLabel` were extended accordingly.
- **`client.delete()`** now delegates straight to `adt.multiDeleteObjects` — the old serial lock-then-delete loop in `src/client/methods/craud/delete.ts` is gone.
- **`ErrorCode`** in `src/types/responses.ts` gained `'EXTERNAL_REFERENCES'`.
- **Integration test** `src/__tests__/integration/cds-workflow.test.ts` extended (47 new lines) to cover the new multi-delete behavior.

## Commits Included
- 6d2c146 — [UPDATE] Multi-deletion with where-used based ordering
- 869f159 — [UPDATE] Merging
- 92caebe — [UPDATE] Support for uploading includes
- 7c8a9eb — [UPDATE] Awaiting full successes from activation now
