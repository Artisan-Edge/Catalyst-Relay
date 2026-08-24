# Changelog - v0.6.7

## Release Date
July 31, 2026

## Overview
Adds user-scoped transport listing: `getUserTransports` returns all transport requests involving a user — workbench **and customizing**, modifiable **and released** — matching the SE10/Eclipse "requests involving user" tree. Previously only modifiable workbench requests were reachable, via the package-scoped `getTransports`.

## Breaking Changes
None. `getTransports` (package-scoped) is unchanged; the new listing is additive.

## What's New

### `getUserTransports` — list a user's transport requests

The existing `getTransports(packageName)` uses the ADT `transportchecks` endpoint, which answers "which transport can a workbench object in this package be recorded on" — so it can only ever return modifiable workbench requests. Customizing requests (needed e.g. to record table content such as Beacon documentation) were invisible to the relay.

`getUserTransports(filters?)` queries the transport-organizer tree (`GET /sap/bc/adt/cts/transportrequests`) — the same request Eclipse's Transport Organizer view sends — and returns a flat list of requests with:

| Field | Description |
|-------|-------------|
| `id` | Transport ID |
| `description` | Request text |
| `owner` | Owner username |
| `type` | `workbench` or `customizing` |
| `status` | `modifiable` or `released` |
| `target` / `targetDescription` | Transport target and its text |
| `lastChanged` | SAP timestamp (`YYYYMMDDHHMMSS`) |

Filters (`user`, `type`, `status`) are optional; `user` defaults to the logged-in user. Type/status filters are applied **server-side** via the ADT `requestType`/`requestStatus` query parameters, which keeps responses small.

```typescript
// Modifiable customizing requests for the logged-in user
const [transports, err] = await client.getUserTransports({ type: 'customizing', status: 'modifiable' });

// Everything involving another user
const [all, err2] = await client.getUserTransports({ user: 'AHUSSAI1' });
```

Also exposed on the HTTP server as `GET /usertransports?user=&type=&status=` (session required). See `docs/endpoints/discovery.md`.

### Gotchas worth knowing

- The ADT tree query returns HTTP 200 with an **empty tree** if `requestType`/`requestStatus` are omitted — no error is raised. The relay always sends both.
- `released` results are limited by the SAP backend to recent history (typically the last two weeks), mirroring Eclipse's default view.

## Technical Details

- **New** `src/core/adt/transports/getUserTransports.ts` — organizer-tree query and XML parsing (`tm:request` elements; type/status decoded from `tm:type`/`tm:status` codes, target taken from the enclosing `tm:target` group). Exports `UserTransport`, `UserTransportFilters`, `TransportStatus`.
- **New** `src/client/methods/discovery/getUserTransports.ts` — session guard, defaults `user` to the session username.
- **New** `src/server/routes/discovery/userTransports.ts` — `GET /usertransports` handler with type/status validation.
- **Changed** `src/client/client.ts`, barrels (`core/adt/index.ts`, `client/methods/discovery/index.ts`, `server/routes/discovery/index.ts`, `src/index.ts`), route registration (`server/routes/index.ts`).
- **Tests** `src/__tests__/core/adt/transports/getUserTransports.test.ts` — parsing fixture captured from a live S/4 system, filter params, session guard; plus live coverage in `src/__tests__/integration/discovery-workflow.test.ts`.

## Commits Included
- d778a7c - [UPDATE] User transport listing (workbench + customizing)
- 1123089 - [UPDATE] Fixing some weird issues with login pages for Public Cloud systems
