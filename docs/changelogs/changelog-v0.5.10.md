# Changelog - v0.5.10

## Release Date
April 8, 2026

## Overview
Adds the ability to query inactive (unactivated) objects from the SAP system — useful for determining what has been created or modified but not yet activated.

## What's New

### Read Inactive Objects
A new `getInactiveObjects()` function retrieves all objects and transports currently in an inactive state on the SAP system. An object is "inactive" after it has been created or modified but before it has been activated via the ADT activation endpoint. This is commonly needed to check whether a newly created object is pending activation.

**Library mode:**
```typescript
const [entries, error] = await client.getInactiveObjects();
// entries: InactiveEntry[] — each entry may contain an object, a transport, or both
```

**Server mode:**
```
GET /inactive-objects
```

Each `InactiveEntry` in the response contains:
- `object` (optional) — the inactive object, including its `user`, `deleted` flag, and `ref` (uri, type, name)
- `transport` (optional) — the associated transport, including its `user`, `linked` flag, and `ref`

### New Exported Types
Four new types are now exported from the library:

| Type | Description |
|------|-------------|
| `InactiveEntry` | A single entry from the inactive objects response |
| `InactiveObject` | An object with an inactive version pending activation |
| `InactiveTransport` | A transport linked to an inactive object |
| `InactiveRef` | Reference details (uri, type, name, description) for either of the above |

## Technical Details

- Added core function `getInactiveObjects()` in `src/core/adt/discovery/inactiveObjects.ts` — calls `GET /sap/bc/adt/activation/inactiveobjects` and parses the `ioc:` namespace XML response
- Added client method `getInactiveObjects()` on the `ADTClient` interface and `ADTClientImpl`
- Added route handler `GET /inactive-objects` in `src/server/routes/discovery/inactiveObjects.ts`
- Extended the CDS workflow integration test with a phase that verifies newly created objects appear in the inactive list before activation

## Commits Included
- 80fb036 - [UPDATE] Adding functionality for reading inactive objects
