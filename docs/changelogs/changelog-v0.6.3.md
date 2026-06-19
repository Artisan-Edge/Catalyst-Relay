# Changelog - v0.6.3

## Release Date
June 19, 2026

## Overview
Reworks transport creation to use SAP's transport-organizer endpoint, which makes the **request type selectable** — you can now create a Customizing request, not just a Workbench one. As part of the switch, `createTransport` no longer takes a `package`; the transport target is resolved automatically (or supplied explicitly). This is a **breaking change** to both the library `TransportConfig` and the HTTP `POST /transports` request body.

## Breaking Changes

`createTransport` switched from the correction-request endpoint (`/sap/bc/adt/cts/transports`) to the transport-organizer endpoint (`/sap/bc/adt/cts/transportrequests`). The request shape changed accordingly.

### Library — `TransportConfig`

| Field | Before (v0.6.2) | After (v0.6.3) |
|-------|-----------------|----------------|
| `package` | **Required** | **Removed** |
| `description` | Required | Required (unchanged) |
| `type` | — | New, optional: `'workbench'` (default) or `'customizing'` |
| `target` | — | New, optional (see target resolution below) |

**Migration:** drop the `package` field. `type` and `target` are both optional — existing calls that pass only `description` continue to work on single-target systems.

```typescript
// Before (v0.6.2)
const [id, err] = await client.createTransport({
  package: 'ZDEV',
  description: 'New feature implementation',
});

// After (v0.6.3)
const [id, err] = await client.createTransport({
  description: 'New feature implementation',
  // type defaults to 'workbench'; target auto-resolves when unambiguous
});
```

### HTTP — `POST /transports`

The `package` body field has been removed and is no longer accepted. New optional fields `type` and `target` are accepted. See [docs/endpoints/discovery.md](../endpoints/discovery.md#post-transports).

```jsonc
// Before
{ "package": "ZDEV", "description": "New feature implementation" }

// After
{ "description": "New feature implementation", "type": "workbench" }
```

## What's New

### Selectable transport request type

The new endpoint lets callers choose the request type, addressing the main gap in the old flow — the correction-request endpoint could only create Workbench requests.

- `type: 'workbench'` → SAP request type `K` (default)
- `type: 'customizing'` → SAP request type `W`

### Automatic transport target resolution

The old flow derived everything from the package. Now the target is handled explicitly:

- If `target` is supplied, it is used as-is.
- If omitted, the target is resolved from SAP's target value-help:
  - **Exactly one** available target → used automatically.
  - **No** targets → error asking for an explicit target.
  - **More than one** target → error listing the available options, so the caller can pick one. (Over HTTP this surfaces as a `500 UNKNOWN_ERROR`.)

### New `getTransportTargets` core function

The target value-help is also available as a standalone core function so callers can list valid targets up front (e.g. to present a picker) instead of relying on auto-resolution. It returns `TransportTarget[]` (`{ name, description }`).

> **Note:** `getTransportTargets` is currently exported from `core/adt` only — it is **not** an `ADTClient` method and is **not** re-exported from the top-level `catalyst-relay` entry point. It is reachable today only via a deep import of the core module.

## Technical Details

### Core Module — `src/core/adt/transports/`

- **`createTransport.ts`** rewritten:
  - Posts the transport-organizer XML body (`tm:root` / `tm:request` / `tm:task`) with content type `application/vnd.sap.adt.transportorganizer.v1+xml`.
  - Now takes an additional `owner` argument (the logged-in username) for the request task.
  - Request type is mapped through `TRANSPORT_TYPE_CODES` (`workbench → K`, `customizing → W`).
  - Target resolved via `resolveTarget()` (explicit value, else single value-help entry, else error).
  - Transport number parsed from the `tm:number` attribute of the returned `tm:request` element via `extractTransportNumber()`.
- **`getTransportTargets.ts`** (new): `GET /sap/bc/adt/cts/transportrequests/valuehelp/target?name=*` with `Accept: application/vnd.sap.adt.nameditems.v1+xml`, parsing `nameditem:namedItem` entries into `TransportTarget[]`.

### Client Method

`src/client/methods/transport/createTransport.ts` now passes `state.session.username` through to the core `createTransport` as the request owner.

### Server Route

`src/server/routes/discovery/createTransport.ts` request schema drops `package`, adds optional `type` (`z.enum(['workbench', 'customizing'])`) and `target` (`z.string().min(1)`), and forwards them into the `TransportConfig`.

### Public API Surface

Re-exported from the top-level `catalyst-relay` entry point:

- `TransportType` (type — new)
- `TransportConfig` (type — shape changed as above)

Exported from `core/adt` only (not from the top-level entry point):

- `getTransportTargets` (function) and `TransportTarget` (type)

> Per the project's public-API rule, anything reachable through `ADTClient` must be re-exported from `src/index.ts`. `getTransportTargets`/`TransportTarget` are not yet reachable through the client, so they remain core-only for now.

### Documentation

`docs/endpoints/discovery.md` updated for the new `POST /transports` request fields, target-resolution behavior, error codes, and examples.

## Commits Included
- 185f69a - [UPDATE] Using the new transport route, so that we can make customizing transports
