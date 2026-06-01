# Changelog - v0.5.14

## Release Date
May 7, 2026

## Overview
Surfaces three task-level fields that SAP returns in transport XML but the parser was previously discarding: task owner, description, and status. Enables consumers to display per-task metadata (collaboration ownership, modifiable/released state, free-text descriptions) without an extra round trip.

## What's New

### Task Owner, Description, and Status on `TaskContents`
`parseTransportTasks` now reads the `tm:owner`, `tm:desc`, and `tm:status` attributes on each `tm:task` element and exposes them as optional fields on `TaskContents`. Consumers can now render:

- **Task owner** — often differs from the parent transport owner (SAP's typical multi-developer workflow assigns sub-tasks to different users).
- **Task description** — the free-text label set by the task owner (e.g. "Header view work", "Hotfix invoice rounding").
- **Task status** — single-letter SAP code (`D` modifiable, `R` released, etc.).

Fields are optional: present (as a string) when SAP returns a value, absent from the result otherwise. Empty-string attributes are treated as absent so callers don't need to distinguish missing-vs-empty.

## Technical Details

- `src/core/adt/transports/parseTransportTasks.ts`:
  - Extended `TaskContents` interface with `owner?: string`, `description?: string`, and `status?: string`.
  - Parser reads each attribute via `taskEl.getAttribute(...)` and uses `...(value ? { key: value } : {})` to omit absent or empty values from the result. This matches the project's `exactOptionalPropertyTypes: true` contract — if the key exists, the value is always a string.
  - Existing `taskId` and `objects` extraction unchanged.

## Backwards Compatibility
The new fields are optional, so existing constructors building `{ taskId, objects }` literals continue to compile and run. Consumers that read `task.owner` / `task.description` / `task.status` get either a string or `undefined` (key missing) — they never receive an empty string masquerading as data.

## Commits Included
- 8151b7b - [ADD] task owner, description, status to TaskContents parser
