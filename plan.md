# Bug: `removeFromTransport` uses request ID instead of task ID

## Problem

`removeFromTransport()` in v0.5.7 fails when called with a request-level transport ID (e.g. `DS4K904756`). Objects in SAP live on **tasks**, not directly on the **request**. The function resolves the object details correctly via `getTransportContents()`, but then passes the original request ID to `removeTransportEntry()` — SAP rejects this because the object isn't on the request.

Error: `Entry R3TR PROG ZSNAP_TPMNPIYPSZ does not exist in request/task DS4K904756`

## Root Cause

`getTransportContents()` reads all `tm:abap_object` elements from the transport XML (including those nested inside `tm:task` elements) but **flattens them** — it doesn't track which task each object belongs to.

`removeFromTransport()` then calls:
```typescript
return removeTransportEntry(client, transportId, object);
//                                  ^^^^^^^^^^^ request ID, should be task ID
```

Meanwhile, `deleteTransport()` handles this correctly — it uses `parseTransportTasks()` to get task-level IDs and calls `removeTransportEntry(client, task.taskId, ...)`.

## Fix

Either:

1. **Have `removeFromTransport` use `parseTransportTasks()` instead of `getTransportContents()`** — parse the transport XML to find which task the object lives on, then call `removeTransportEntry` with the correct task ID.

2. **Extend `getTransportContents()` to return `taskId` on each object** — add a `taskId` field to `TransportObject`, then use it in `removeTransportEntry`.

Option 1 is simpler and mirrors how `deleteTransport` already works.
