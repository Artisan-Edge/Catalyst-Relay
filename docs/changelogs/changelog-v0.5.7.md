# Changelog - v0.5.7

## Release Date
April 7, 2026

## Overview
Simplifies the `removeFromTransport` interface — callers now pass just the object name instead of a full `TransportObject` struct. The function handles looking up the object details internally.

## What's New

### Simplified Transport Object Removal
Previously, removing an object from a transport required the caller to supply all five fields of a `TransportObject` (name, description, pgmid, type, position). This was ergonomically painful — callers rarely have those details on hand.

Now, `removeFromTransport` accepts only the object name. It fetches the transport contents, locates the matching entry, and removes it.

**Before:**
```typescript
await client.removeFromTransport('DS4K904588', {
    name: 'ZSNAP_F72TG_103',
    description: 'Test object',
    pgmid: 'R3TR',
    type: 'DDLS',
    position: '000002',
});
```

**After:**
```typescript
await client.removeFromTransport('DS4K904588', 'ZSNAP_F72TG_103');
```

**Server mode:** The `PUT /transports/:transportId/objects` endpoint now only requires `{ name }` in the request body.

## Technical Details

### Refactored Core Functions
- `removeFromTransport()` — Now accepts `objectName: string` instead of `TransportObject`. Internally calls `getTransportContents()` to resolve the full object entry before removal.
- `removeTransportEntry()` — New internal helper extracted from the old `removeFromTransport`. Used by both `removeFromTransport` (public) and `deleteTransport` (internal) to perform the actual SAP XML removal request.

### Simplified Server Route
- `removeFromTransportRequestSchema` — Reduced from 5 required fields to just `name`

### Updated Tests
- Added a new integration test phase that removes an object from a transport by name

## Commits Included
- d56761f - [UPDATE] Simplifying the external interface to remove an item from a transport
