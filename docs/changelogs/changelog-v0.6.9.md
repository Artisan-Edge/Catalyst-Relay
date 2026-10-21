# Changelog - v0.6.9

## Release Date

September 23, 2026

## Overview

Objects can now be reassigned to another package through `client.changePackage()` and `POST /objects/change-package`, including data elements, domains, function groups and service bindings. C1 API releases can set the Cloud Development and Key User Apps visibility flags (defaulting to Cloud Development only), visibility of a released view can be changed or previewed, and package trees now list objects of unsupported types separately instead of dropping them. Activation also got more reliable: object-level errors without a source position no longer count as success, and a transient failure while fetching activation results is retried instead of aborting the run.

## Breaking Changes

Nothing is removed or renamed, and all new parameters are optional. Two behavior changes affect existing API release callers:

- **Release defaults to Cloud Development only.** `releaseApi()` and `POST /api-release/:name/release` without visibility flags used to turn on both Cloud Development and Key User Apps. They now turn on Cloud Development only. To keep the old behavior, pass `{ useInCloudDevelopment: true, useInKeyUserApps: true }`.
- **Release and unrelease skip objects already in the target state.** Releasing a released view (or unreleasing one that is not released) sends nothing to SAP and returns `changed: false` with an info message. Previously the contract was rewritten, which also reset visibility. Use `updateApiReleaseVisibility()` to change the flags of a released view.

Type-level: `TreeResponse` gains a required `unsupportedObjects` array, `ApiReleaseState` / `ApiReleaseResult` gain a required `visibility` field, and `ApiReleaseResult` gains a required `changed` field. Code that builds these objects itself (e.g. test mocks) must add the new fields to typecheck.

## What's New

### Change package assignment

`changePackage(objects, targetPackage, options?)` moves objects to another package using SAP's change-package refactoring, the same requests Eclipse ADT sends for **Change Package Assignment**. SAP runs it in two steps:

1. **Preview**: SAP validates the change and returns the resolved refactoring.
2. **Execute**: the relay sends that refactoring back with the transport set.

Once the execute step has run, the relay reads the object's package back and reports `error` if it didn't change, so a move SAP accepted but ignored isn't reported as success.

```typescript
const objects = [{ name: "ZTT_TEST", extension: "asddls" }];

// Dry run: SAP validates, nothing changes
const [preview] = await client.changePackage(objects, "ZSNAP_NEW", {
  transport: "DEVK900123",
  preview: true,
});

// Move
const [results, error] = await client.changePackage(objects, "ZSNAP_NEW", {
  transport: "DEVK900123",
});
```

- Results are per object with status `moved`, `preview`, `unchanged` (already in the target package) or `error`. Objects are processed one at a time; one failure does not stop the rest.
- A transport is needed when either package is transportable; moves between local packages need none. The relay passes the transport through and lets SAP decide.
- No lock is taken. Eclipse doesn't take one for this refactoring either.
- Supports every type in `OBJECT_CONFIG_MAP` (views, access controls, classes, tables, structures, programs, includes, service definitions, behavior definitions), plus four move-only types: `dtel` (data element), `doma` (domain), `fugr` (function group) and `srvb` (service binding). Nothing else in the library can read, write, activate or delete the move-only types, so they are kept out of `OBJECT_CONFIG_MAP` and exported as `MOVE_ONLY_EXTENSIONS`. Covered by unit tests; not yet verified on a live system.

**ABAP Cloud restriction:** S/4HANA Cloud and BTP ABAP refuse moves from a transportable package into a local one with "No authorization for changing the package". Moving the other way, local to transportable, works. When a move is rejected and the source package records changes but the target does not, the relay appends a hint to the error message saying so.

Verified on S/4HANA Cloud: local → transportable moved and was recorded on the transport; transportable → local was refused with the hint.

### Unsupported objects are listed in the package tree

`getTree()` / `POST /tree` used to drop objects whose type the library has no configuration for, so a package looked emptier than it was and move-only objects could not be found. These objects now appear in a new `unsupportedObjects` array with `name`, `adtType` (e.g. `DTEL/DE`), and optional `uri` and `description`. `objects` still holds only configured types, which are the ones read, upsert, activate and delete accept.

```typescript
const [tree] = await client.getTree({ package: "ZSNAP_F01" });
tree.unsupportedObjects; // [{ name: "ZSNAP_DE", adtType: "DTEL/DE", ... }]
```

### C1 release visibility flags

`releaseApi()` and `POST /api-release/:name/release` can now set the two visibility checkboxes from ADT's API State tab: **Use in Cloud Development** and **Use in Key User Apps**. Before this, both were always sent as on.

```typescript
await client.releaseApi("ZSNAP_F04S_Q01", "DEVK900123", {
  useInCloudDevelopment: true,
  useInKeyUserApps: true,
});
```

- Without flags, a release turns on **Cloud Development only** (see Breaking Changes). The HTTP body takes `useInCloudDevelopment` and `useInKeyUserApps` booleans.
- A release with both flags off is rejected before any request is sent.
- `getApiReleaseState()` and the release/unrelease results now report the flags in `visibility`.
- Release and unrelease read the current state first and do nothing if the object is already there. The result has `changed: false` and an info message. When a released view has different flags from the ones requested, the message says the request was not applied.
- `unreleaseApi()` sends the current flags back unchanged. Previously it sent both as on, which could change visibility as a side effect.

### Changing visibility of a released view

`updateApiReleaseVisibility(name, change, options?)` and `POST /api-release/:name/visibility` change the flags of a view that is already released, without unreleasing it. Flags left out of `change` keep their current value. Because narrowing a live contract can be refused by SAP or be hard to undo, `preview: true` runs only SAP's validation and applies nothing.

```typescript
// Check first: does SAP accept turning Key User Apps off?
const [check] = await client.updateApiReleaseVisibility(
  "ZSNAP_F04S_Q01",
  { useInKeyUserApps: false },
  { transport: "DEVK900123", preview: true },
);

// Apply
const [result, error] = await client.updateApiReleaseVisibility(
  "ZSNAP_F04S_Q01",
  { useInKeyUserApps: false },
  { transport: "DEVK900123" },
);
// result.previous, result.requested, result.visibility, result.changed
```

- Returns an error if the view is not released, or if the change would turn both flags off.
- If the requested flags already match, nothing is sent (`changed: false`).
- The result reports `previous`, `requested` and resulting `visibility`, plus `changed`, `preview` and validation `messages`.

Covered by unit tests; not yet verified on a live system.

### Object-level activation errors are no longer reported as success

The activation parser dropped error messages that carried no source position, for example a DCL that cannot bind to an inactive view (`Entity ZSNAP_M00S_C01 is inactive`). The object was then reported `success` although it stayed inactive. These messages are now kept and mark the object failed; positioned errors keep their line and column as before.

### Transient activation-result failures are retried

SAP occasionally answers the fetch of a finished run's results with a 500 ("An exception was raised"), which used to abort the whole activation. The relay now retries that GET up to 3 times, 1 second apart. 4xx responses are not retried, and the POST that starts a run is never repeated.

## Technical Details

- **New** `src/core/adt/refactoring/changePackage.ts`: `changePackage()`, `ChangePackageResult`, `ChangePackageStatus`, `ChangePackageOptions`.
- **New** `src/core/adt/refactoring/helpers.ts`: preview body builder, execute body built from the server's preview response (`userContent` is kept, transport set), object URI builder.
- **New** `src/core/adt/discovery/objectPackage.ts`: `getObjectPackage()` reads an object's package via `objectproperties?facet=package`. `searchObjects` package enrichment now uses it.
- **New** `src/core/adt/discovery/packageTransportInfo.ts`: `getPackageTransportInfo()` reads a package's software component and `recordChanges` flag (used for the hint).
- **New** `src/client/methods/refactoring/`: client method with the session guard; `ADTClient.changePackage` added.
- **New** route `POST /objects/change-package` (`src/server/routes/objects/changePackage.ts`).
- **New** `src/core/adt/refactoring/moveTargets.ts`: `resolveMoveTarget()` resolves configured and move-only extensions to a `MoveTarget` (endpoint, type, label); `MOVE_ONLY_EXTENSIONS`.
- **Changed** `src/core/adt/discovery/tree/`: `UnsupportedObjectNode` type; `parseTreeXml()` collects unconfigured types instead of skipping them.
- **Changed** `src/core/adt/craud/apirelease/`: `ApiReleaseVisibility` type; `buildC1ReleaseBody()` takes visibility (`DEFAULT_C1_VISIBILITY` = Cloud Development only); `parseReleaseState()` reads the flags; release and unrelease fetch the current state first and short-circuit when already there; `changed` on `ApiReleaseResult`.
- **New** `src/core/adt/craud/apirelease/setState.ts`: validation run and PUT extracted from `release.ts` (`validateApiReleaseChange()`, `setApiReleaseState()`), shared by release, unrelease and visibility updates.
- **New** `src/core/adt/craud/apirelease/visibility.ts`: `updateApiReleaseVisibility()`, `ApiReleaseVisibilityOptions`; `ApiReleaseVisibilityResult` in `types.ts`.
- **Changed** `ADTClient.releaseApi` takes an optional `visibility` argument; the release route accepts the two flags. **New** `ADTClient.updateApiReleaseVisibility` and route `POST /api-release/:name/visibility`.
- **Exports** `ChangePackageResult`, `ChangePackageStatus`, `ChangePackageOptions`, `ApiReleaseVisibility`, `ApiReleaseVisibilityOptions`, `ApiReleaseVisibilityResult`, `UnsupportedObjectNode` and `MOVE_ONLY_EXTENSIONS` from `src/index.ts`.
- **Changed** `src/core/adt/craud/activation.ts`: positionless message handling; `fetchActivationResults()` retry helper.
- **Tests** `src/__tests__/core/adt/refactoring/changePackage.test.ts` (new, 14 tests); `src/__tests__/core/adt/craud/activation.test.ts` (new, parser and retry cases).
- **Tests** for visibility flags (`apirelease/helpers.test.ts`), release/unrelease short-circuit and visibility updates (`apirelease/release.test.ts`, new), unsupported tree objects (`tree/parsers.test.ts`) and move-only types (`changePackage.test.ts`).
- **Docs** `docs/endpoints/objects.md` (new section), `docs/endpoints/discovery.md` (`unsupportedObjects`), `docs/endpoints/api-release.md` (new; API release endpoints were previously undocumented), `docs/endpoints/index.md`, `docs/api-reference.md`.

## Commits Included

- 8c4437c - [UPDATE] Activation parser keeps positionless errors instead of reporting them as success
- c055707 - [UPDATE] Retry transient failures when fetching activation results
- d56a5c5 - [UPDATE] Change package assignment via ADT refactoring (v0.6.9)
- 936f958 - [UPDATE] C1 release visibility flags, unsupported tree objects listed separately, move for DTEL/DOMA/FUGR/SRVB
- ed57cb8 - [UPDATE] API release defaults to Cloud Development only, release/unrelease no-op when already in state, visibility update with preview
