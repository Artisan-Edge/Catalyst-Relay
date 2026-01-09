# Changelog - v0.3.1

## Release Date
January 9, 2026

## Overview
This patch release improves batch upload performance by parallelizing upsert operations.

## Breaking Changes
None.

## What's New

### Parallel Upsert Operations
The `upsert()` method now processes multiple objects in parallel instead of sequentially. When uploading a batch of objects, each upsert is dispatched concurrently, significantly reducing total upload time for large batches.

**Impact:**
- Uploading 10 objects now takes roughly the time of 1 object (plus overhead) instead of 10x the time
- Error handling aggregates all failures into an `AggregateError` so you can see all issues at once

**Usage remains unchanged:**
```typescript
const [results, error] = await client.upsert(objects, packageName, transport);
if (error) {
    // error may be AggregateError with multiple failures
    console.error(error);
}
```

## Technical Details

### New `upsertSingle()` Method
The upsert logic was extracted into a new internal `upsertSingle()` method that handles a single object. The main `upsert()` method now dispatches all objects to `upsertSingle()` concurrently and awaits all results.

### New Result Utilities
Added utility functions in `src/types/result.ts` for handling arrays of results:
- `resolveAll<T, E>(results)` - Separates successful values from errors in a Result array
- `resolveAllAsync<T, E>(promises)` - Same as above, but awaits an array of AsyncResult promises first

### Error Aggregation
When multiple upserts fail, errors are collected into a single `AggregateError` rather than failing on the first error. This provides better visibility into batch failures.

## Commits Included
- `c9d6c73` - [UPDATE] Properly asyncing the dispatch of multiple upserts at a time
- `71c6707` - Merge branch 'main' into dev
