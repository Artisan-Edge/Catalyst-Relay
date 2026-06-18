# Changelog - v0.6.0

## Release Date
June 18, 2026

## Overview
Restores SAML SSO login under the Bun runtime (Playwright's launcher/WebSocket no longer work there) and introduces a full programmatic service binding lifecycle, alongside support for creating service definitions and behavior definitions. All changes are additive.

## Breaking Changes
None. Existing APIs and behavior are unchanged — every change in this release adds new methods, types, object types, or a new route.

## What's New

### SAML Login Works Under Bun Again

SAML SSO authentication was broken when running under the Bun runtime: Playwright's own browser launcher and bundled WebSocket transport both hang under Bun (the `--remote-debugging-pipe` handshake never completes). This release fixes that by selecting the browser transport based on runtime:

- **Bun** — Catalyst-Relay now spawns the Chromium binary itself with `--remote-debugging-port` and drives it over the Chrome DevTools Protocol (CDP) using Bun's native `WebSocket`. Playwright is still used (import only) to resolve the Chromium executable path, so browser provisioning is unchanged.
- **Node / Electron** (e.g. the VS Code extension) — Playwright works normally, so the original Playwright flow is used unchanged.

The transport is chosen automatically; no configuration is required. The login behavior — navigate to the SAP login page, fill credentials, wait for network idle, extract session cookies — is identical across both paths.

**New escape hatch:** set the `CATALYST_CHROMIUM_PATH` environment variable to point at a specific Chrome/Chromium binary and bypass Playwright's executable resolution entirely.

### Service Binding Lifecycle

Two new methods on `ADTClient` create and remove OData service bindings programmatically. This supports the Beacon ABAP deployment workflow and is a stable, supported feature.

```typescript
// Validate → create → activate → publish, in one call
const [result, error] = await client.createServiceBinding({
    bindingName: 'ZBEACON_DOCS_O5',
    serviceDefinition: 'ZBEACON_DOCS_API',
    packageName: 'ZBEACON',
    transport: 'DEVK900123',   // required for non-$TMP packages
    // publish defaults to true; set false to create + activate only
});

// Unpublish (best-effort) → delete
const [, delError] = await client.deleteServiceBinding('ZBEACON_DOCS_O5', 'DEVK900123');
```

`createServiceBinding` sequences the full lifecycle and aborts on the first failure: it validates against the server (surfacing any non-`OK` severity as an error), creates the binding shell, activates it, and — unless `publish: false` — publishes the OData V4 service. A binding that fails activation is never published. The returned `ServiceBindingResult` reports the created/activated/published state and any publish message.

`deleteServiceBinding` locks the binding once, unpublishes it (tolerating failure, since the binding may not be published), then deletes the binding object.

**Server Mode:** a new route exposes binding creation:

```
POST /businessservices/bindings
```

It requires a session, validates the request body with Zod, and enforces that a `transport` is supplied for any non-`$TMP` package.

> **Scope note:** Only OData V4 bindings (`bindingType: 'ODATA'`, `bindingVersion: 'V4'`) are supported today. The `ServiceBindingType` / `ServiceBindingVersion` types are intentionally narrow so the surface can widen later without a breaking change.

### Service Definitions and Behavior Definitions

The object create flow now understands two new ABAP object types, so they can be created and activated like any other source object:

- **Service Definition** (`srvd`) — created with the required `srvd:srvdSourceType="S"` root attribute.
- **Behavior Definition** (`asbdef`) — created with an `<adtcore:adtTemplate>` block carrying its implementation type.

Behavior definitions accept a new optional `implementationType` field (`ObjectContent.implementationType`), expressed via the new `BehaviorImplementationType` enum. Only `Managed` RAP is supported today; the enum exists so callers specify the type explicitly and so it can be widened (unmanaged, abstract, projection) later. It defaults to `Managed` when omitted.

## Technical Details

### New Public API

Exported from `catalyst-relay`:

- **Methods** (on `ADTClient`): `createServiceBinding(options)`, `deleteServiceBinding(bindingName, transport?)`
- **Types:** `CreateServiceBindingOptions`, `ServiceBindingResult`, `ServiceBindingType`, `ServiceBindingVersion`, `ActivationReference`
- **Runtime value:** `BehaviorImplementationType` enum
- **Extended:** `ObjectContent` gains an optional `implementationType` field

### Core Modules

New `src/core/adt/businessservices/` package (one function per file):

- `validate.ts` → `validateServiceBinding()` — pre-flight check; errors on non-`OK` severity
- `create.ts` → `createServiceBindingObject()` — posts the structured binding XML (bindings have no source)
- `activate.ts` → `activateServiceBinding()` — activates via a hand-built `SRVB/SVB` reference
- `publish.ts` → `publishServiceBinding()`, `unpublishServiceBinding()` — lock → submit OData V4 (un)publish job → always unlock
- `delete.ts` → `deleteServiceBinding()`
- `helpers.ts` — internal lock/unlock and publish-job helpers (not exported from the barrel)
- `types.ts` — `CreateServiceBindingOptions`, `ServiceBindingResult`, and the binding type/version unions

### Activation Refactor

`activation.ts` gains `activateByReferences(client, references)`, a lower-level entry point that activates a set of pre-resolved `ActivationReference` objects. `activateObjects()` now resolves objects to references via the extension registry and delegates to it, while service bindings — which aren't source-file-backed — build their own references directly. No change to `activateObjects()` behavior.

### Object Config

`ObjectConfig` gains two optional fields: `rootAttributes` (extra root-element attributes on create) and `requiresImplementationType` (inject the `adtTemplate` block). `ConfiguredExtension` adds `'srvd'` and `'asbdef'`; `ObjectTypeLabel` adds `SERVICE_DEFINITION` and `BEHAVIOR_DEFINITION`.

### XML Utility

New `extractTagText(xml, tagName)` in `core/utils/xml.ts` — returns the trimmed text of the first matching element, or `null` if absent/empty/unparseable. Used to read `SEVERITY` / `SHORT_TEXT` from validate and (un)publish responses.

### Tests

- `src/__tests__/core/adt/businessservices/serviceBinding.test.ts`
- `src/__tests__/integration/service-binding-workflow.test.ts`
- `src/__tests__/core/adt/craud/create.test.ts` (service/behavior definition creation)

## Commits Included
- 598863e - [UPDATE] Adding service binding unpublish and stuff
- 9a1d124 - [UPDATE] First pass at new service binding stuff
- 0192c1a - Merge pull request #7 from Artisan-Edge/features/saml-auth
- 193ec4a - [UPDATE] Rework SAML auth flow for bun runtime
