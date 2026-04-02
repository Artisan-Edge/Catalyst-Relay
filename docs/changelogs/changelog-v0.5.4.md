# Changelog - v0.5.4

## Release Date
April 1, 2026

## Overview
Adds automatic package enrichment to search results so consumers always get the containing package for each object, and migrates the `search()` method to an options object pattern for extensibility.

## Breaking Changes

### `search()` Signature Change

The `search` method's second parameter changed from a positional `types` array to a `SearchOptions` object:

```typescript
// Before (v0.5.3)
const [results, err] = await client.search('Z*', ['DDLS/DF']);

// After (v0.5.4)
const [results, err] = await client.search('Z*', { types: ['DDLS/DF'] });
```

**Migration:** Replace any `search(query, types)` calls with `search(query, { types })`. Calls with no second argument (`search('Z*')`) continue to work unchanged.

**Server mode:** No HTTP API changes — the `POST /search/:query` endpoint accepts the same request body.

### `SearchResult` Type Change

`SearchResult` now includes a required `uri` field. Code that constructs `SearchResult` objects manually (e.g., in tests or mocks) must include the `uri` property.

```typescript
// Before
{ name: 'ZTEST', extension: 'clas.abap', package: 'ZDEV', objectType: 'CLAS' }

// After
{ name: 'ZTEST', uri: '/sap/bc/adt/oo/classes/ztest', extension: 'clas.abap', package: 'ZDEV', objectType: 'CLAS' }
```

## What's New

### Package Enrichment in Search Results

The SAP quickSearch API often returns empty package fields. Search results are now automatically enriched with package information by querying the ADT objectproperties endpoint for each result missing a package. This runs in parallel for performance.

```typescript
const [results, err] = await client.search('ZSNAP_F01S_C01');
console.log(results[0].package); // 'ZSNAP_DEV' — previously empty string
```

Package enrichment is enabled by default. To skip it (for faster searches where package info isn't needed):

```typescript
const [results, err] = await client.search('Z*', { includePackages: false });
```

### `SearchOptions` Interface

The new options object supports:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `types` | `string[]` | All types | Object type filters |
| `includePackages` | `boolean` | `true` | Enrich results with package info |

## Technical Details

### New Types
- `SearchOptions` — Exported from `core/adt` and available to library consumers

### Modified Files
- `src/core/adt/discovery/searchObjects.ts` — Added `SearchOptions` interface, `uri` to `SearchResult`, and `enrichWithPackages` helper that queries `/sap/bc/adt/repository/informationsystem/objectproperties/values` in parallel
- `src/core/adt/index.ts` — Exported `SearchOptions` type
- `src/client/client.ts` — Updated `search()` signature to accept `SearchOptions`
- `src/client/methods/search/search.ts` — Passes options object through to core
- `src/server/routes/search/search.ts` — Wraps body types array into `SearchOptions` object
- `src/__tests__/integration/search-workflow.test.ts` — Updated to new signature, added package enrichment test

## Commits Included
- 29dcb42 - [UPDATE] Adding package enrichment to the search endpoint
- c03a218 - [HOTFIX] Bump package.json
