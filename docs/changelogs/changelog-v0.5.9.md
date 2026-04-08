# Changelog - v0.5.9

## Release Date
April 7, 2026

## Overview
Adds the ability to view all tasks and their objects on a transport request, completing the transport management API surface.

## What's New

### View Transport Objects
A new `viewTransportObjects` function lets consumers inspect the full contents of a transport request — every task and every object within each task. This rounds out the transport management capabilities alongside the existing create, delete, and remove operations.

**Library mode:**
```typescript
const [tasks, error] = await client.viewTransportObjects('NPLK900042');
// tasks: TaskContents[] — each entry has a taskId and an objects array
```

**Server mode:**
```
GET /transports/:transportId/objects
```

Returns an array of tasks, each containing its `taskId` and a list of objects with `name`, `pgmid`, and `type` fields.

### New Exported Type: `TaskContents`
The `TaskContents` type is now exported from the library for consumers who need to type the response.

## Technical Details

- Added core function `viewTransportObjects()` in `src/core/adt/transports/viewTransportObjects.ts` — fetches the transport XML from SAP and delegates to the shared `parseTransportTasks()` parser
- Added client method `viewTransportObjects()` on `ADTClient` interface and `ADTClientImpl`
- Added route handler `GET /transports/:transportId/objects` in `src/server/routes/discovery/viewTransportObjects.ts`
- Extended integration test suite with a new phase verifying all created objects are visible on the transport

## Commits Included
- 5738efc - [UPDATE] Exposing functionality to get tasks on a transport and all objects on said task
