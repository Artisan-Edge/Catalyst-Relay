# Changelog - v0.4.1

## Release Date
January 9, 2026

## Overview
Patch release fixing object count and description retrieval for top-level packages by switching back to the virtualfolders endpoint.

## What's New

### Top-Level Package Counts Fixed

The `getTree({})` call (without a package) now correctly returns `numContents` for each top-level package. The nodestructure endpoint used in v0.4.0 didn't provide object counts, so top-level packages always showed `numContents: 0`.

```typescript
// Now correctly returns counts
const [result, err] = await client.getTree({});
result.packages.forEach(pkg => {
    console.log(`${pkg.name}: ${pkg.numContents} objects`);
});
// ZSNAP_F01: 132 objects
// ZDEV: 45 objects
```

### Package Descriptions Restored

Top-level packages now include their descriptions again. The virtualfolders endpoint provides the `text` attribute which contains the package description.

```typescript
const [result, err] = await client.getTree({});
result.packages[0];
// { name: "ZSNAP_F01", description: "SNAP Framework", numContents: 132 }
```

### New getPackageStats() Function

Added a new function to fetch stats for a specific package by name. Uses the virtualfolders endpoint to get recursive object count and the packages endpoint for metadata.

```typescript
const [stats, err] = await client.getPackageStats('ZSNAP_F01');
// { name: "ZSNAP_F01", description: "SNAP Framework", numContents: 132 }
```

### Tree Types Exported

The tree-related types are now exported from the main package entry point:

```typescript
import type {
    TreeResponse,
    PackageNode,
    FolderNode,
    ObjectNode,
    ApiState,
} from 'catalyst-relay';
```

## Technical Details

### Endpoint Strategy Change

Top-level package queries now use the virtualfolders endpoint instead of nodestructure:

| Query | v0.4.0 | v0.4.1 |
|-------|--------|--------|
| `getTree({})` | nodestructure | virtualfolders |
| `getTree({ package: 'X' })` | virtualfolders | virtualfolders (unchanged) |

### Parser Fix

Fixed the XML parser to read the `text` attribute (not `description`) for folder display names from virtualfolders responses.

### New Module

Added `src/core/adt/discovery/tree/packageStats.ts` containing the `getPackageStats()` implementation.

## Documentation Updates

- Updated `docs/endpoints/discovery.md` with correct Tree API examples and response structure
- Removed `parentPackage` field from Package documentation (not returned by current implementation)
- Removed `status` field from Transport documentation (not returned by current implementation)

## Commits Included
- `01c77ff` - Hybrid solution for tree queries
- `39304fb` - Switch to virtualfolders for top-level packages
- `2575afb` - Export tree types from index
