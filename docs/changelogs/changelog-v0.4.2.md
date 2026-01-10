# Changelog - v0.4.2

## Release Date
January 10, 2026

## Overview
Hotfix extending the virtualfolders endpoint fix from v0.4.1 to child packages, ensuring they also return correct object counts and descriptions.

## What's New

### Child Package Counts Fixed

When querying a package's children via `getTree({ package: 'X' })`, child packages now correctly return `numContents` values. Previously, child packages used the nodestructure endpoint which always returned `numContents: 0`.

```typescript
// Now correctly returns counts for child packages
const [result, err] = await client.getTree({ package: 'ZROOT' });
result.packages.forEach(pkg => {
    console.log(`${pkg.name}: ${pkg.numContents} objects`);
});
// ZCHILD_A: 45 objects
// ZCHILD_B: 23 objects
```

### Consistent Endpoint Usage

All package queries now use the virtualfolders endpoint:

| Query | v0.4.1 | v0.4.2 |
|-------|--------|--------|
| `getTree({})` | virtualfolders | virtualfolders |
| `getTree({ package: 'X' })` children | nodestructure | virtualfolders |
| `getTree({ package: 'X', path: [...] })` | virtualfolders | virtualfolders |

## Technical Details

### Module Rename

Renamed `subpackages.ts` to `childPackages.ts` to better reflect its purpose:
- `getSubpackages()` → `fetchChildPackages()`
- Uses virtualfolders endpoint with `hasChildrenOfSameFacet: true`

### Test Coverage

Added comprehensive tests for tree parsers and discovery workflow integration tests.

## Commits Included
- `8a16f56` - Fixing an issue with child packages
