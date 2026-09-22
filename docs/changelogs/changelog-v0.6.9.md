# Changelog - v0.6.9

## Release Date

September 22, 2026

## Overview

Objects can now be reassigned to another package through `client.changePackage()` and `POST /objects/change-package`. Activation also got more reliable: object-level errors without a source position no longer count as success, and a transient failure while fetching activation results is retried instead of aborting the run.

## Breaking Changes

None. `changePackage` is a new method on `ADTClient`; nothing existing is removed or renamed.

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
- Supports every type in `OBJECT_CONFIG_MAP` (views, access controls, classes, tables, structures, programs, includes, service definitions, behavior definitions).

**ABAP Cloud restriction:** S/4HANA Cloud and BTP ABAP refuse moves from a transportable package into a local one with "No authorization for changing the package". Moving the other way, local to transportable, works. When a move is rejected and the source package records changes but the target does not, the relay appends a hint to the error message saying so.

Verified on S/4HANA Cloud: local → transportable moved and was recorded on the transport; transportable → local was refused with the hint.

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
- **Exports** `ChangePackageResult`, `ChangePackageStatus` and `ChangePackageOptions` from `src/index.ts`.
- **Changed** `src/core/adt/craud/activation.ts`: positionless message handling; `fetchActivationResults()` retry helper.
- **Tests** `src/__tests__/core/adt/refactoring/changePackage.test.ts` (new, 14 tests); `src/__tests__/core/adt/craud/activation.test.ts` (new, parser and retry cases).
- **Docs** `docs/endpoints/objects.md` (new section), `docs/api-reference.md`.

## Commits Included

- 8c4437c - [UPDATE] Activation parser keeps positionless errors instead of reporting them as success
- c055707 - [UPDATE] Retry transient failures when fetching activation results
- d56a5c5 - [UPDATE] Change package assignment via ADT refactoring (v0.6.9)
