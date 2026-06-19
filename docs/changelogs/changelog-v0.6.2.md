# Changelog - v0.6.2

## Release Date
June 18, 2026

## Overview
Adds the read counterpart to v0.6.1's class-include write capability: you can now read the source of a global class's local-source includes (CCDEF/CCIMP/CCMAC/CCAU). This completes the read/write round-trip for include sources — e.g. fetch a RAP behaviour handler back out of the *Local Types* include. All changes are additive.

## Breaking Changes
None. Existing APIs and behavior are unchanged.

## What's New

### Read Class Includes

v0.6.1 added `writeClassInclude` to author a class's local-source includes, but there was no way to read them back — `read` only returns a class's **main source**. This release adds the symmetric read:

- `definitions` — Class-relevant Local Definitions (CCDEF)
- `implementations` — Local Types (CCIMP) — where RAP behaviour handlers live
- `macros` — Macros (CCMAC)
- `testclasses` — Test Classes (CCAU)

Reading an include returns its full source as a string. No lock is taken — it is a plain `GET`.

**Library usage** — new `readClassInclude()` method on `ADTClient`:

```typescript
import { createClient } from 'catalyst-relay';
import type { ClassIncludeType } from 'catalyst-relay';

const [source, err] = await client.readClassInclude(
    'ZBEACON_G_BEHAVIORDEFINITION',
    'implementations',          // ClassIncludeType
);
if (err) throw err;

console.log(source); // the Local Types include source
```

#### Use Cases
- **Inspect RAP behaviour handlers** — read the `lhc_*` handler back out of a behaviour pool class
- **Round-trip edits** — read an include, modify it, and write it back via `writeClassInclude`
- **Diff/verification** — confirm what was written to an include after activation

## Technical Details

### New Public API

Exported from `catalyst-relay`:

- **Method** (on `ADTClient`): `readClassInclude(className, includeType)` → `AsyncResult<string>`

(The `ClassIncludeType` parameter type was already exported in v0.6.1; no new type exports are required.)

### Core Module

`src/core/adt/craud/classInclude.ts` adds `readClassInclude()` — issues `GET /sap/bc/adt/oo/classes/{class}/includes/{includeType}` with `Accept: text/plain` and returns the body. It reuses the existing `aclass` endpoint config, since includes only exist on classes, and targets the same include URI that `updateClassInclude` writes to. Exported from `core/adt`.

### Client Method

New `src/client/methods/craud/specialcases/classes/readClassInclude.ts` is a thin wrapper: it guards on an active session, then delegates to the core `readClassInclude`. No lock/unlock dance is needed for a read.

### Tests

`src/__tests__/integration/abap-class-workflow.test.ts` gains two steps in the class lifecycle, run before deletion:

- **write a local type** to the `implementations` include via `writeClassInclude`
- **read it back** via `readClassInclude` and assert the returned source contains the local class

Verified end-to-end against a live SAP system (G3-Dev): 9 pass, 0 fail.

## Commits Included
- e9e399b - [UPDATE] Read the special class includes
