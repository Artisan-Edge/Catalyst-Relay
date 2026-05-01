# Changelog - v0.5.12

## Release Date
May 1, 2026

## Overview
Patch release that closes gaps in the public API surface introduced by v0.5.11 — types and the `ExternalReferencesError` class referenced in last release's documentation are now actually re-exported from the package entry point.

## What's New

### Public API surface fixes
The following items were reachable through the `ADTClient` interface in v0.5.11 but were not re-exported from `'catalyst-relay'`, forcing consumers to either deep-import from `core/adt` or duplicate type definitions. They are now available directly from the top-level entry point:

- **Error class:** `ExternalReferencesError` — required for `instanceof` narrowing on the error returned by `client.delete()` when external references block a deletion.
- **Result types:** `CheckResult`, `DeleteResult`, `ExternalReference` — return shapes for the multi-delete flow added in v0.5.11.
- **Options types:** `GetPackagesOptions` — parameter type for `client.getPackages()`.
- **Discriminated union members:** `DiffHunk`, `SimpleDiffHunk`, `ModifiedDiffHunk` — needed to write exhaustive switches over `DiffResult` hunks.

No runtime behavior has changed. Consumers who were working around the missing exports with deep imports (`from 'catalyst-relay/dist/core/adt'`) or local re-declarations can now switch to the top-level import.

## Technical Details

- `src/index.ts` — added the type re-exports listed above and a new runtime export for `ExternalReferencesError`.
- `.claude/CLAUDE.md` — added a "Public API Surface" section documenting the checklist for re-exporting anything reachable through the `ADTClient` interface, so this class of omission is caught at authoring time rather than after release.

## Commits Included
- 1dc039c — [UPDATE] Exporting more types
