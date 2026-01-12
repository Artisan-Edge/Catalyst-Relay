# Changelog - v0.4.2

## Release Date
January 12, 2026

## Overview
Patch release fixing `getPackageStats()` to actually return the requested package's stats, and adding batch support for fetching multiple packages in a single call.

## What's New

### Batch Package Stats

`getPackageStats()` now accepts an array of package names, returning stats for all of them in a single request. This is useful for scenarios like fetching metadata for a user's favorite packages without making N separate calls.

```typescript
// Single package (unchanged)
const [stats, err] = await client.getPackageStats('ZSNAP_F01');
// stats: { name: 'ZSNAP_F01', description: 'SNAP Package', numContents: 42 }

// Multiple packages (new)
const [stats, err] = await client.getPackageStats(['ZSNAP_F01', 'ZSNAP_F02', 'ZSNAP_F03']);
// stats: [{ name: 'ZSNAP_F01', ... }, { name: 'ZSNAP_F02', ... }, ...]
```

## Bug Fixes

### `getPackageStats()` Now Returns Correct Data

Fixed a critical bug where `getPackageStats('PKG')` would take a long time and return irrelevant data instead of the requested package's stats.

**Root cause:** SAP's virtualfolders endpoint has a quirk—when only one package is in the preselection, it drills INTO that package (returning its contents) rather than returning the package itself as a top-level result. With 2+ packages, it correctly returns those packages.

**Fix:** When requesting a single package, we now add `SRIS_TEST_DATA_VFS_EMPTY` (a known empty SAP system package) to the preselection. This forces SAP to return packages as top-level results without adding noise to the response.

## Technical Details

### Simplified Implementation

The implementation was consolidated from two separate API calls to one:

**Before (v0.4.1):**
1. POST `/virtualfolders` for object count
2. GET `/packages/{name}` for description
3. Merge results

**After (v0.4.2):**
1. POST `/virtualfolders/contents` with package names in preselection
2. Parse `counter` (object count) and `text` (description) attributes directly

This is both faster and simpler.

### Cleanup

Removed debug test file `src/__tests__/debug-virtualfolders.ts`.

## Commits Included
- `0fada16` - Fix getPackageStats to work around SAP single-package quirk
