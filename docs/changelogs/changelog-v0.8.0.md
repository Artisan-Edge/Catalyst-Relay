# Changelog - v0.8.0

## Release Date

November 4, 2026

## Overview

Relay can now take a RAP service from service binding to business catalog. It can read service bindings, create UI bindings, create IAM apps and business catalogs, and create packages. Concurrent requests on one client now share a single CSRF refresh or session reset, and per-object fan-outs run at most 8 requests at a time. Changing a data element label no longer breaks activation.

## Breaking Changes

None of the method signatures change. Callers will notice these differences:

- **`ServiceBindingResult` has new required fields:** `category`, `steps` and `notes`. Code that builds this type itself (for example, a mock) must add them.
- **`createServiceBinding()` re-runs on an existing binding instead of failing.** If the binding already exists with the same service definition, category and OData version, the method skips validation and creation and runs only the steps still missing (activation, publish). If any of those three differ, it returns an error.
- **Validation `INFO` passes.** Before, any severity other than `OK` stopped the create. Now `INFO` (for example, "V4 without draft is primarily read-only") passes and is reported in `notes`. `WARNING` still fails unless you pass `allowWarnings: true`.
- **Per-object operations run concurrently.** `read()`, `gitDiff()`, the source reads for syntax check, container resolution, the package lookups in search, the deletes in `multiDelete` and `POST /where-used` used to run one at a time or all at once. They now run up to 8 at a time (`ADT_CONCURRENCY`). Results keep input order, and the error returned is still the first one in input order.

## What's New

### Service bindings: read, UI category, safe re-runs

`readServiceBinding()` returns a binding's service definition, OData version, category, publish state, active state and release state, or `null` when the binding doesn't exist.

```typescript
const [binding, error] = await client.readServiceBinding("ZUI_SALES_O4");
// binding?.category === 'UI', binding?.published === true
```

`createServiceBinding()` (and `POST /businessservices/bindings`) has two new options:

- `bindingCategory: 'UI' | 'WEB_API'` (default `'WEB_API'`). Business users reach a **UI** binding through an IAM app, business catalog and business role. A **Web API** binding is reached through communication arrangements.
- `allowWarnings: boolean` (default `false`) lets a validation `WARNING` through instead of stopping the create.

The result has two new fields. `steps` records whether each of validate, create, activate and publish ran (`DONE`) or was skipped (`SKIPPED`). `notes` collects INFO/WARNING texts.

A publish job on a public cloud tenant can run longer than the default request timeout, so publish requests now allow 5 minutes. If the publish request fails anyway, Relay reads the binding back. If the binding shows as published, the create succeeds and the failed request is recorded in `notes`. If it doesn't, the error says the binding is active but not published and that running the create again will publish it.

### Cloud IAM: IAM apps and business catalogs

These four methods expose a UI service to business users (SIA6 → SIA1/SIA7):

| Method                           | Purpose                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `createIamApp(options)`          | Create an IAM app (default type `EXT`), add services to its Services tab, publish it locally.    |
| `readIamApp(name)`               | Read an app's type, listed services and publish status.                                          |
| `createBusinessCatalog(options)` | Create a business catalog, assign IAM apps (`<catalog>_0001`, `_0002`, ...), publish it locally. |
| `readBusinessCatalog(name)`      | Read a catalog's assigned apps and publish status.                                               |

```typescript
await client.createIamApp({
  appName: "ZSALES_IAM_EXT",
  packageName: "ZSALES",
  description: "Sales orders",
  transport: "DEVK900123",
  services: [{ name: "ZUI_SALES_O4", type: "G4BA" }], // G4BA = OData V4, IWSV = OData V2
});

await client.createBusinessCatalog({
  catalogName: "ZSALES_BC",
  packageName: "ZSALES",
  description: "Sales",
  transport: "DEVK900123",
  apps: ["ZSALES_IAM_EXT"],
});
```

Both creates are safe to run again. They reuse an existing object and add only the services or apps that are missing. A catalog is published only if something changed or it isn't published yet. An IAM app is published on every run: SAP reports a new app as published before its first publish, so Relay can't tell whether one is needed. Assigning an app that doesn't exist fails with `IAM app X does not exist` before anything is sent to SAP.

### Package create

`createPackage()` creates a development package under a super-package. The software component and transport layer default to the super-package's, which is what Eclipse's New Package wizard proposes. If the package already exists under the same parent, the result has `created: false`. If it exists under a different parent, the method returns an error. The create is sent stateless so that the new package stays editable from other sessions.

### Transport create on public cloud

Public cloud tenants only allow local transport requests ("Creation of requests of type DEV is not allowed"). When Relay picked the target itself, `createTransport()` now retries once with target `LOCAL`. When the caller passed an explicit target, the error now suggests passing `LOCAL`.

### Concurrent session recovery

When several requests hit an expired CSRF token or session at the same time, they now wait on one refresh or one reset instead of each starting its own. Previously, a second reset's logoff could end the session the first reset had just set up, and drop the locks taken on it. A refresh and a reset never run at the same time, and the requests a recovery makes can't start a recovery of their own. That last rule fixes a hang: a reset's logoff against a dead session returns 500, which used to trigger another reset that waited on the first.

### Data element labels activate after a change

Since v0.7.0, changing a label set its field length to `0`, on the assumption that SAP would work out the length on activation. SAP doesn't, so the data element failed to activate. Now a label that still fits keeps its length, and one that no longer fits is widened to the maximum (from `<prefix>MaxLength`, or 10/20/40/55 if the document doesn't have one). A write also repairs any `0` length left by an earlier version. New data elements are created with the maximum lengths. This corrects the v0.7.0 changelog, which said SAP derives label lengths on activation.

## Technical Details

- **New** `src/core/adt/businessservices/read.ts`: `readServiceBinding()` / `parseServiceBinding()`. Replaces `readServiceBindingPublished()` in `helpers.ts`.
- **Changed** `src/core/adt/businessservices/helpers.ts`: `judgeSeverity()` handles severities for both validation and publish jobs. `bindingCategoryCode()` / `bindingCategoryFromCode()` map `UI`/`WEB_API` to `srvb:category` `0`/`1`. Publish jobs use a 300 s timeout.
- **New** `src/core/adt/iam/` (`app.ts`, `catalog.ts`, `helpers.ts`, `types.ts`) with orchestration in `src/client/methods/iam/`.
- **New** `src/core/adt/packages/createPackage.ts` (`createPackage()`, `readPackageSettings()`, `parsePackageSettings()`) with `src/client/methods/packages/`.
- **New** `src/core/utils/concurrency.ts`: `mapLimited()` and `ADT_CONCURRENCY = 8`.
- **Changed** `src/client/methods/internal/request.ts`: an `AsyncLocalStorage` flag marks requests made by a recovery, and in-flight recoveries are shared per client through a `WeakMap`.
- **Changed** `src/core/adt/transports/createTransport.ts`: retries with target `LOCAL`.
- **Changed** `src/core/ddic/dataElementXml.ts`: label lengths are widened to their maximum instead of reset to `0`.
- **Exports** All new parameter and result types are re-exported from `src/index.ts`, including `ServiceBindingCategory`, `ServiceBindingInfo`, `ServiceBindingSteps`, the `Iam*` and `BusinessCatalog*` types, `CatalogAppAssignment`, `CreatePackageOptions`, `CreatePackageResult` and `PackageSettings`.
- **Server** `POST /businessservices/bindings` accepts `bindingCategory` and `allowWarnings`. IAM, package create and binding read are library-only; they have no HTTP routes.
- **Tests** New unit tests cover request recovery, service bindings, IAM, package create and transport create, plus new cases for data element label lengths.

## Verification

Verified against a live SAP system.

## Commits Included

- 9c88cb9 - [UPDATE] Service binding read/UI category, IAM apps and business catalogs, package create; shared CSRF/session recovery and bounded concurrency
- 69660d2 - [FIX] Data element write keeps label lengths valid (widen to max instead of 0) so changed labels activate
