# Changelog - v0.4.0

## Release Date
January 9, 2026

## Overview
Major redesign of the Tree API with structured responses, SSO/mTLS authentication fixes, and improved error handling for batch operations.

## Breaking Changes

### Tree API Response Structure

The `getTree()` function now returns a structured `TreeResponse` instead of a flat array of `TreeNode` objects. This provides clear separation between packages, folders, and objects.

**Migration:**
```typescript
// Before (v0.3.x)
const [nodes, err] = await client.getTree({ package: 'ZSNAP_F01' });
// nodes: TreeNode[] - flat array mixing folders and objects

// After (v0.4.0)
const [result, err] = await client.getTree({ package: 'ZSNAP_F01' });
// result: { packages: PackageNode[], folders: FolderNode[], objects: ObjectNode[] }

// Access subpackages
result.packages.forEach(pkg => console.log(pkg.name, pkg.numContents));

// Access folders (groups like "Core Data Services")
result.folders.forEach(f => console.log(f.displayName, f.numContents));

// Access objects (at leaf level)
result.objects.forEach(obj => console.log(obj.name, obj.objectType));
```

### TreeNode Type Removed

The `TreeNode` type has been removed from exports. Use the new structured types instead:
- `PackageNode` - for subpackages
- `FolderNode` - for category folders
- `ObjectNode` - for SAP objects

### TreeQuery.package Now Optional

The `package` field is now optional. Omit it to retrieve only top-level packages (packages without a parent).

```typescript
// Get top-level packages only
const [result, err] = await client.getTree({});
// result.packages contains only root-level packages
```

### resolveAll Return Type Changed

`resolveAll()` and `resolveAllAsync()` now return `Result<T[], AggregateError>` instead of `[T[], E[]]`. This makes error handling consistent with the rest of the API.

```typescript
// Before (v0.3.x)
const [successes, errors] = resolveAll(results);
if (errors.length > 0) { /* handle */ }

// After (v0.4.0)
const [successes, aggregateErr] = resolveAll(results);
if (aggregateErr) {
    // aggregateErr.errors contains individual errors
    // aggregateErr.message lists all errors with indices
}
```

## What's New

### Structured Tree Response

Tree queries now return separate arrays for packages, folders, and objects:
- **packages**: Subpackages within the queried package
- **folders**: Category folders (GROUP and TYPE facets like "Core Data Services", "Data Definitions")
- **objects**: Actual SAP objects with type and extension info

### API State on Objects

Objects at the TYPE level now include `apiState` indicating their release status:

```typescript
interface ObjectNode {
    name: string;
    objectType: string;
    extension: string;
    apiState?: {
        useInCloudDevelopment: boolean;
        useInCloudDvlpmntActive: boolean;
        useInKeyUserApps: boolean;
    };
}
```

This eliminates the need to drill into redundant API folders (NOT_RELEASED, USE_IN_CLOUD_DEVELOPMENT, etc.) - objects are fetched from all folders and merged with their release state flags.

### Top-Level Package Discovery

Call `getTree({})` without a package to get only top-level packages. Unlike `getPackages('*')` which returns all packages including nested ones, this returns only packages without a parent.

### SSO/mTLS Support Fixed

SSO authentication with client certificates now works reliably. The HTTP client was rewritten to use Node.js native `https` module instead of undici, which doesn't support mTLS properly.

### Improved Aggregate Errors

When multiple operations fail (e.g., batch upserts), the `AggregateError` message now lists each individual error with its index:
```
Multiple upsert errors:
[1] Object ZVIEW1 not found
[2] Transport request required for ZVIEW2
```

## Technical Details

### HTTP Client Rewrite
- Replaced undici with Node.js native `https` module
- All requests now support mTLS client certificates
- Works consistently across Node.js, Bun, and Electron environments

### Tree Module Reorganization
The monolithic `tree.ts` file was split into a modular structure:
```
src/core/adt/discovery/tree/
├── index.ts          # Main getTree function
├── types.ts          # Type definitions
├── subpackages.ts    # nodestructure endpoint
├── virtualFolders.ts # virtualfolders endpoint
└── parsers.ts        # XML parsing
```

### Dual-Endpoint Tree Fetching
Tree queries now use two SAP ADT endpoints:
1. **nodestructure** - for subpackages (DEVC/K objects)
2. **virtualfolders** - for folder hierarchy and objects

### Type Constraints
Result types now use `E extends Error` constraint for better type safety.

## Commits Included
- `fb604f2` - More tests and top level package stuff
- `20ce5b6` - Drastically improving the get tree setup
- `d8caf2b` - Merge SSO branch
- `5143627` - Making good progress
- `817b4ab` - Cleaning
- `d04f289` - Accept header for non-overriden requests
- `adfffda` - Test that tree queries don't self-contain package
- `a62903e` - Making aggregate error list all individual errors
- `e53fc2d` - Switch to Node.js https module for mTLS support
- `46cf9b7` - Cookie persistence between SLS requests
- `796f3fb` - Bun/Node.js SSL bypass compatibility
