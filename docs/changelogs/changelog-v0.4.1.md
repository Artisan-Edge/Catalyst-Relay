# Changelog - v0.4.1

## Release Date
January 12, 2026

## Overview
Patch release fixing missing object counts in top-level package queries and adding a new `getPackageStats()` API.

## What's New

### New `getPackageStats()` Function

Query stats for any package by name, returning its description and recursive object count (includes all objects in subpackages).

```typescript
const [stats, err] = await client.getPackageStats('ZSNAP_F01');
// stats: { name: 'ZSNAP_F01', description: 'SNAP Package', numContents: 42 }
```

This is useful when you need metadata for a specific package without querying its full tree contents.

### Type Exports

The following types are now exported from the main package index:
- `TreeResponse`
- `PackageNode`
- `FolderNode`
- `ObjectNode`
- `ApiState`

```typescript
import type { PackageNode, TreeResponse } from 'catalyst-relay';
```

## Bug Fixes

### Top-Level Package Counts Restored

Fixed an issue where `getTree({})` (top-level package query) was returning packages without `numContents`. The v0.4.0 implementation used the nodestructure endpoint which doesn't return object counts. This release reverts to using the virtualfolders endpoint for top-level queries.

**Impact:** Consumers relying on `numContents` for top-level packages will now get accurate values.

## Technical Details

### New `packageStats.ts` Module

Added `src/core/adt/discovery/tree/packageStats.ts` which:
1. POSTs to `/sap/bc/adt/repository/informationsystem/virtualfolders` with package preselection to get recursive object count
2. GETs `/sap/bc/adt/packages/{name}` for package description
3. Fetches both in parallel for performance

### Hybrid Tree Query Strategy

Top-level queries now use virtualfolders (for counts), while package-specific queries continue using the nodestructure endpoint for folder hierarchy.

## Commits Included
- `01c77ff` - Hybrid solution combining virtualfolders for top-level queries
- `39304fb` - Revert to virtualfolders endpoint to fix missing object counts
- `2575afb` - Export tree types from main index
