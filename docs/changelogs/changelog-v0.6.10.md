# Changelog - v0.6.10

## Release Date

October 21, 2026

## Overview

Service bindings can now be created, published, unpublished and deleted as OData V2 Web API bindings, not only OData V4. This is for systems that cannot register an OAuth scope on a V4 binding. A publish whose job succeeded but whose unlock dumped is no longer reported as a failed create.

## Breaking Changes

None. `ServiceBindingVersion` widens from `'V4'` to `'V4' | 'V2'`, and every new parameter is optional with a V4 default, so existing callers behave as before. Code that switches exhaustively over `ServiceBindingVersion` must handle `'V2'` to typecheck.

## What's New

### OData V2 service bindings

`createServiceBinding()` and `POST /businessservices/bindings` accept `bindingVersion: 'V2'`. `deleteServiceBinding()` takes a new optional third argument, `version`.

```typescript
// Create, activate and publish a V2 Web API binding
const [result, error] = await client.createServiceBinding({
  bindingName: "ZBEACON_F70_API_V2",
  serviceDefinition: "ZBEACON_F70_API",
  packageName: "ZBEACON",
  bindingVersion: "V2",
  transport: "DEVK900001",
});

// Unpublish and delete it
await client.deleteServiceBinding("ZBEACON_F70_API_V2", "DEVK900001", "V2");
```

The two versions differ in three ways:

| | V4 | V2 |
|---|---|---|
| Service name in the binding (`srvb:services`) | Service definition name | Binding name |
| Publish / unpublish job | `odatav4/publishjobs`, `odatav4/unpublishjobs` | `odatav2/publishjobs`, `odatav2/unpublishjobs` |
| Job query parameters | none | `servicename=<binding>&serviceversion=0001` |

A V2 binding has to name its service after the binding. With the service definition name, as V4 uses, the V2 publish job reports success but registers nothing.

When `deleteServiceBinding()` is called without a version, it tries the V4 unpublish first and falls back to the V2 one. The unpublish stays best-effort as before: if neither succeeds, the delete still goes ahead.

As before, publishing from a customizing client fails (SAP Note 3101976).

### A failed unlock after a successful publish no longer fails the create

The first publish of a V2 binding can dump in the unlock that follows it (`OBJECTS_OBJREF_NOT_ASSIGNED`). The dump ends the stateful session, which also releases the lock, but the unlock error used to fail the whole create even though the service was published. Now, when the job succeeds and the unlock fails, the relay:

1. Retries the unlock once, in case the lock is still held.
2. If that also fails, reads the binding and checks its `srvb:published` flag.
3. Accepts the job only if the flag matches the intended state (published after a publish, unpublished after an unpublish). Otherwise it returns the original unlock error.

This applies to V4 bindings as well.

## Technical Details

- **Changed** `src/core/adt/businessservices/types.ts`: `ServiceBindingVersion = 'V4' | 'V2'`.
- **Changed** `src/core/adt/businessservices/create.ts`: `srvb:services` name is the binding for V2, the service definition for V4.
- **Changed** `src/core/adt/businessservices/helpers.ts`: `submitServiceBindingJob()` takes a `version` (default `'V4'`), builds the path as `odata<version>/<action>jobs` and adds the V2 query parameters. **New** `readServiceBindingPublished()` reads `srvb:published` from the binding.
- **Changed** `src/core/adt/businessservices/publish.ts`: `publishServiceBinding()` / `unpublishServiceBinding()` take an optional `version`. **New** `recoverFailedUnlock()` implements the retry-then-verify logic.
- **Changed** `src/core/adt/businessservices/delete.ts`: `deleteServiceBinding()` takes an optional `version` and tries V4 then V2 when it is omitted.
- **Changed** `createServiceBinding` client method passes `bindingVersion` (default `'V4'`) to the publish. `ADTClient.deleteServiceBinding()` gains the `version` parameter.
- **Changed** route `POST /businessservices/bindings`: `bindingVersion` validates as `'V4' | 'V2'`. The HTTP server has no delete-binding route, so the delete's version parameter is library-only.
- **Tests** `src/__tests__/core/adt/businessservices/serviceBinding.test.ts` gains V2 cases: job paths and query parameters, V2 service naming, delete fallback order, unlock recovery. All 236 core unit tests pass and `bun run typecheck` is clean.
- **Docs** The endpoint docs and `api-reference.md` do not mention V2 bindings yet.

## Verification

V2 binding create, publish, unpublish and delete were verified on a live system through Catalyst-CLI v1.1.11 (`catalyst adt binding create/delete --odata-version v2`).

## Commits Included

- 7541f81 - [UPDATE] OData V2 service bindings: V2 create, publish/unpublish via odatav2 jobs with servicename/serviceversion, version-aware delete
- 4bb1cc8 - [FIX] OData V2 service bindings: service named after the binding, unlock dump after a confirmed publish no longer fails the create
