# Changelog - v0.5.8

## Release Date
April 7, 2026

## Overview
Fixes a bug where `removeFromTransport` passed the transport request ID instead of the task ID when removing objects, causing SAP to reject the removal request.

## What's New

### Bug Fix: Transport Object Removal Now Targets the Correct Task
Previously, `removeFromTransport` called `getTransportContents()` to list objects, then passed the **transport request ID** to the removal endpoint. SAP requires the **task ID** — the sub-level container that actually holds the object — so the call failed.

The function now reads the transport XML directly, walks the task hierarchy to find which task contains the target object, and issues the removal against that task ID.

This fix affects both library mode (`removeFromTransport()`) and server mode (`PUT /transports/:transportId/objects`).

## Technical Details

### Extracted `parseTransportTasks` into Shared Module
- `parseTransportTasks()` was previously a private function inside `deleteTransport.ts`. It is now its own file (`parseTransportTasks.ts`) and exported, so both `deleteTransport` and `removeFromTransport` can reuse it.

### Refactored `removeFromTransport`
- No longer depends on `getTransportContents()` — instead fetches and parses the transport XML directly
- Iterates over parsed tasks to locate the object, then calls `removeTransportEntry()` with the correct task ID

## Commits Included
- f6c269f - [BUG-FIX] Removing item from transport now finds the relevant task before attempting removal
