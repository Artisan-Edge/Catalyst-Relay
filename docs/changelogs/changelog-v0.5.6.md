# Changelog - v0.5.6

## Release Date
April 7, 2026

## Overview
Adds full transport lifecycle management — delete transports, remove individual objects from transports, and inspect transport contents. These capabilities support the Catalyst-CLI tool being built over this library.

## What's New

### Transport Deletion
Delete transport requests via `deleteTransport()`. SAP transports have a hierarchy (Request → Tasks → Objects) that must be unwound in order. The `removeObjects` flag handles this automatically — it sorts/compresses each task, removes all objects, deletes the tasks, then deletes the parent request.

```typescript
// Simple delete (transport must already be empty)
const [, err] = await client.deleteTransport('DS4K904713');

// Force delete (removes all objects from tasks first)
const [, err] = await client.deleteTransport('DS4K904713', true);
```

**Server mode:** `DELETE /transports/:transportId?removeObjects=true`

### Remove Objects from Transports
Remove individual objects from a transport task via `removeFromTransport()`.

```typescript
const [, err] = await client.removeFromTransport('DS4K904588', {
    name: 'ZSNAP_F72TG_103',
    description: 'Test object',
    pgmid: 'R3TR',
    type: 'DDLS',
    position: '000002',
});
```

**Server mode:** `PUT /transports/:transportId/objects`

### Transport Contents Inspection
Read all objects on a transport with `getTransportContents()` (core function, not yet exposed on the client).

```typescript
import { getTransportContents } from 'catalyst-relay/core/adt';
const [objects, err] = await getTransportContents(requestor, 'DS4K904713');
```

## Technical Details

### New Core Functions
- `deleteTransport()` — Deletes a transport and its full task hierarchy
- `removeFromTransport()` — Removes a single object from a transport task via SAP's XML PUT API
- `getTransportContents()` — Reads and parses all `tm:abap_object` entries from a transport

### New Types
- `TransportObject` — Describes an object entry on a transport (`name`, `pgmid`, `type`, `position`, `description`)

### New Client Methods
- `client.deleteTransport(transportId, removeObjects?)` — Delegates to core `deleteTransport`
- `client.removeFromTransport(transportId, object)` — Delegates to core `removeFromTransport`

### New Server Routes
- `DELETE /transports/:transportId` — Delete a transport request (`?removeObjects=true` to force)
- `PUT /transports/:transportId/objects` — Remove an object from a transport (validated with Zod)

### New Test Coverage
- `transport-lifecycle.test.ts` — Integration tests for the full transport create → inspect → remove → delete workflow

### Modified Files
- `src/core/adt/index.ts` — Exports new functions and `TransportObject` type
- `src/client/client.ts` — Added `deleteTransport` and `removeFromTransport` methods
- `src/client/methods/transport/index.ts` — Barrel exports for new methods
- `src/server/routes/index.ts` — Wired new routes
- `src/index.ts` — Exports `TransportObject` type

## Commits Included
- 3faf1fe - [UPDATE] Transport management capabilities
- 98eeeee - [UPDATE] Able to remove objects from a task to forcibly delete transports now
- bd3274a - [UPDATE] Test suite passes
