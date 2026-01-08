# Tree Discovery Fix - TODO

## Problem Summary

The `getTree` function in `src/core/adt/discovery/tree.ts` was simplified and now only handles PACKAGE facet, breaking the hierarchical tree explorer in Catalyst-Edit.

**Symptom:** When clicking on a top-level package in the server-side explorer, it returns the same package over and over instead of showing children.

## Root Causes

### 1. Parent Marker Not Filtered
When querying children of package `ZTEST`, SAP returns:
- `..ZTEST` (parent marker - "go back up")
- `ZTEST_CHILD1`, `ZTEST_CHILD2`, etc.

The code strips the `..` prefix but doesn't filter out the parent marker, so `..ZTEST` becomes `ZTEST` and appears as its own child.

**Old Python fix (line 698 in old client.py):**
```python
output.virtualFolders[facet] = [entry for entry in output.virtualFolders[facet] if entry.name != '..' + name]
```

### 2. Only PACKAGE Facet Handled
Current `getTree` (lines 59-76):
```typescript
export async function getTree(client: AdtRequestor, query: TreeQuery): AsyncResult<TreeNode[], Error> {
    const internalQuery: TreeDiscoveryQuery = {};
    if (query.package) {
        internalQuery.PACKAGE = {
            name: query.package.startsWith('..') ? query.package : `..${query.package}`,
            hasChildrenOfSameFacet: false,
        };
    }
    // folderType and parentPath are DEFINED but NEVER USED!
    ...
}
```

TYPE, GROUP, API facets are completely ignored. The `TreeQuery` interface has `folderType` and `parentPath` but they do nothing.

### 3. Missing Recursive Merge for hasChildrenOfSameFacet
The old Python had recursive logic: when `hasChildrenOfSameFacet=True` in the query, it would:
1. Make initial request (gets subpackages because PACKAGE is in facetorder)
2. Make second request with `hasChildrenOfSameFacet=False` (gets types, groups, APIs)
3. Merge results together

This allows showing BOTH subpackages AND object types when expanding a package.

## Files to Fix

### Catalyst-Relay

**`src/core/adt/discovery/tree.ts`:**
1. Update `parseTreeResponse` to filter out parent markers (needs query context)
2. Update `getTree` to handle all facets (TYPE, GROUP, API), not just PACKAGE
3. Add recursive merge logic for `hasChildrenOfSameFacet=True`

**`src/types/requests.ts`:**
- May need to expand `TreeQuery` interface to support full multi-facet queries

### Catalyst-Edit

**`src/relay/tree_search.ts`:**
- Fix `convertTreeQuery` function - currently uses mutually exclusive if/else that only passes ONE facet:
```typescript
function convertTreeQuery(query: TreeDiscoveryQuery): catalyst_relay.TreeQuery {
    if (query.PACKAGE) return { package: query.PACKAGE.name, folderType: 'PACKAGE' };
    if (query.TYPE) return { folderType: 'TYPE', parentPath: query.TYPE.name };
    // When PACKAGE + TYPE exist, only PACKAGE is sent!
}
```

## Reference: Old Python Implementation

```python
async def tree_discovery(self, query: types.TreeDiscoveryQuery, search_pattern: str = "*", depth: str = "1"):
    url = "/sap/bc/adt/repository/informationsystem/virtualfolders/contents"
    body = utils.construct_body(query, search_pattern)
    resursive_facets = {k: v.name for k, v in vars(query).items() if v and v.hasChildrenOfSameFacet}
    # ... make request ...
    if 200 <= status < 300:
        output = utils.extract_for_tree(text)
        if len(resursive_facets) == 0:
            return types.SuccessResponse(context=output)
        # Recursive merge for hasChildrenOfSameFacet
        for i, (facet, name) in enumerate(resursive_facets.items()):
            # Filter out parent marker
            output.virtualFolders[facet] = [entry for entry in output.virtualFolders[facet] if entry.name != '..' + name]
            # Recursive call with hasChildrenOfSameFacet=False to get other facet types
            response = await self.tree_discovery(
                types.TreeDiscoveryQuery(**{facet: types.VirtualFolder(name=name, hasChildrenOfSameFacet=False)}),
                search_pattern,
                depth + str(i + 1)
            )
            if not response.success:
                return response
            output = utils.merge_outputs(output, response.context)
        return types.SuccessResponse(context=output)
```

## How hasChildrenOfSameFacet Works

In **responses**: SAP tells you if a folder has more children of the same type (e.g., package has subpackages).

In **requests**:
- `hasChildrenOfSameFacet=True` on a facet means "include this facet in `<vfs:facetorder>`" (show me children of this type)
- `hasChildrenOfSameFacet=False` means "only put in `<vfs:preselection>`" (I'm here, show me the NEXT facet level)

The XML body construction in old code:
```python
facets = [k for k, v in vars(self).items() if not v or v.hasChildrenOfSameFacet]
# A facet goes into facetorder if: not specified OR hasChildrenOfSameFacet=True
```

## Note on getPackages

The CEO's optimization for `getPackages` is valid - it uses the search API with `objectType: 'DEVC/K'` to directly list packages. This is faster for the sidebar dropdown. But `getTree` still needs full facet support for the file system explorer.
