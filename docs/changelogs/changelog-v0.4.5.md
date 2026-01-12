# Changelog - v0.4.5

## Release Date
January 12, 2026

## Overview
Adds owner filtering to tree discovery, allowing results to be filtered by the object creator/owner.

## Breaking Changes
None.

## What's New

### Owner Filtering in Tree Discovery

The `getTree` function now accepts an optional `owner` parameter to filter results by object owner. This filters the tree to only show objects created by the specified user.

```typescript
// Get all objects in $TMP
const [all, err] = await client.getTree({ package: '$TMP' });

// Get only objects owned by a specific user
const [mine, err] = await client.getTree({
    package: '$TMP',
    owner: 'EBOSCH',
});
```

**Server Mode:** The `/tree` endpoint also accepts the `owner` field in the request body:

```json
POST /tree
{
    "package": "$TMP",
    "owner": "EBOSCH"
}
```

When filtered by owner, folder `numContents` counts reflect only the items owned by that user.

## Technical Details

### Implementation

- Added `owner?: string` to `TreeQuery` interface and Zod schema
- Owner is passed as a `<vfs:preselection facet="owner">` element in the SAP ADT virtual folders request
- Propagated through `fetchVirtualFolders` → `constructTreeBody` → XML generation

### Files Changed

- `src/types/requests.ts` - Added owner to TreeQuery
- `src/core/adt/discovery/tree/parsers.ts` - Updated constructTreeBody to include owner preselection
- `src/core/adt/discovery/tree/virtualFolders.ts` - Pass owner parameter
- `src/core/adt/discovery/tree/index.ts` - Pass owner to fetchVirtualFolders calls

### Test Coverage

Added integration test verifying that owner-filtered results return fewer items than unfiltered results for packages with multiple contributors.
