# Changelog - v0.6.1

## Release Date
June 18, 2026

## Overview
Adds the ability to write a global class's local-source includes (CCDEF/CCIMP/CCMAC/CCAU), which unblocks authoring RAP behaviour handlers — code that must live in a class include and cannot be written through `upsert`/`update`. All changes are additive.

## Breaking Changes
None. Existing APIs and behavior are unchanged. The internal relocation of the service-binding methods (see Technical Details) does not affect the public API surface — `createServiceBinding`/`deleteServiceBinding` and their types are still exported from `catalyst-relay` with identical signatures.

## What's New

### Write Class Includes (RAP Behaviour Handlers)

`upsert` and `update` only write a class's **main source**. RAP behaviour handlers — `CL_ABAP_BEHAVIOR_HANDLER` subclasses (`lhc_*`) — must instead live in the class's *Local Types* include, which previously could not be written through Catalyst-Relay. This release adds a dedicated capability for the local-source includes of a global ABAP class:

- `definitions` — Class-relevant Local Definitions (CCDEF)
- `implementations` — Local Types (CCIMP) — **where RAP behaviour handlers live**
- `macros` — Macros (CCMAC)
- `testclasses` — Test Classes (CCAU)

The full lock → write include → unlock sequence is handled automatically. Writing an include replaces that include's entire source; activate the class afterwards to compile the change.

**Library usage** — new `writeClassInclude()` method on `ADTClient`:

```typescript
import { createClient } from 'catalyst-relay';
import type { ClassIncludeType } from 'catalyst-relay';

const [, err] = await client.writeClassInclude(
    'ZBEACON_G_BEHAVIORDEFINITION',
    'implementations',          // ClassIncludeType
    handlerSource,
    'SDSK900342',               // transport — required for non-$TMP packages
);
if (err) throw err;

// Activate the class to compile the handler.
await client.activate([{ name: 'ZBEACON_G_BEHAVIORDEFINITION', extension: 'aclass' }]);
```

**Server Mode** — new route:

```
POST /objects/class-include
```

It requires a session and validates the body with Zod (`className`, `includeType` enum, `source`, optional `transport`). The endpoint is fully documented in `docs/endpoints/objects.md`.

#### Use Cases
- **RAP behaviour handlers** — author the `lhc_*` handler in the *Local Types* include of a behaviour pool class
- **Local test classes** — push unit tests into the *Test Classes* (CCAU) include
- **Local helper types** — define local classes/interfaces the global class depends on

## Technical Details

### New Public API

Exported from `catalyst-relay`:

- **Method** (on `ADTClient`): `writeClassInclude(className, includeType, source, transport?)` → `AsyncResult<void>`
- **Type:** `ClassIncludeType` (`'definitions' | 'implementations' | 'macros' | 'testclasses'`)

### Core Module

New `src/core/adt/craud/classInclude.ts`:

- `updateClassInclude()` — issues `PUT /sap/bc/adt/oo/classes/{class}/includes/{includeType}` with the supplied lock handle and optional `corrNr` transport. Reuses the existing `aclass` endpoint config, since includes only exist on classes. Exported (with the `ClassIncludeType` type) from `core/adt`.

### Client Method

New `src/client/methods/craud/specialcases/classes/writeClassInclude.ts` orchestrates the lifecycle: it locks the class (`extension: 'aclass'`), writes the include via `updateClassInclude`, then **always** unlocks — even if the write failed — returning the first error encountered.

### Server Route

New `src/server/routes/objects/classInclude.ts` (`classIncludeHandler`) with a colocated Zod request schema and `ClassIncludeResponse` type, wired into `server/routes/index.ts`.

### Internal Refactor — `specialcases/`

The client-side service-binding methods moved from `src/client/methods/businessservices/` into `src/client/methods/craud/specialcases/businessservices/`, alongside the new `specialcases/classes/` folder. This groups CRAUD operations that don't follow the standard create/update path (service bindings, class includes) under one `specialcases` parent. Imports were updated accordingly; **no consumer-facing change** — the public exports and signatures are identical.

### Documentation

`docs/endpoints/objects.md` adds a full **POST /objects/class-include** section (request/response tables, example, error catalog, use cases, and library usage).

### Tests

- `src/__tests__/index.test.ts` and `serviceBinding.test.ts` updated to reflect the relocated service-binding module paths.

## Commits Included
- 33e1b7b - [UPDATE] Local classes stuff
