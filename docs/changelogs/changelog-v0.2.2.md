# Changelog - v0.2.2

## Release Date
December 10, 2025

## Overview
Breaking change to the data preview API — replaces structured filters/sorting with raw SQL support, enabling full query flexibility for SQL Console and advanced aggregation use cases.

## Breaking Changes

### `POST /preview/data` — New Request Format

The `PreviewQuery` interface has changed significantly:

**Before (v0.2.1):**
```typescript
interface PreviewQuery {
    objectName: string;
    objectType: 'table' | 'view';
    filters?: Filter[];      // Removed
    orderBy?: OrderBy[];     // Removed
    limit?: number;
    offset?: number;         // Removed
}
```

**After (v0.2.2):**
```typescript
interface PreviewQuery {
    objectName: string;
    objectType: 'table' | 'view';
    sqlQuery: string;        // New — required
    limit?: number;
}
```

### Removed Types

The following types are no longer exported from `catalyst-relay`:
- `Filter`
- `FilterOperator`
- `OrderBy`

### Migration Guide

Callers must now construct SQL queries directly instead of using structured filter objects.

**Example migrations:**

Simple SELECT:
```typescript
// Before
{ objectName: 'MARA', objectType: 'table', limit: 100 }

// After
{ objectName: 'MARA', objectType: 'table', sqlQuery: 'SELECT * FROM MARA', limit: 100 }
```

With filters:
```typescript
// Before
{
    objectName: 'MARA',
    objectType: 'table',
    filters: [
        { column: 'MTART', operator: 'eq', value: 'FERT' },
        { column: 'MATNR', operator: 'like', value: 'A%' }
    ]
}

// After
{
    objectName: 'MARA',
    objectType: 'table',
    sqlQuery: "SELECT * FROM MARA WHERE MTART = 'FERT' AND MATNR LIKE 'A%'"
}
```

With sorting:
```typescript
// Before
{
    objectName: 'MARA',
    objectType: 'table',
    orderBy: [{ column: 'MATNR', direction: 'asc' }]
}

// After
{
    objectName: 'MARA',
    objectType: 'table',
    sqlQuery: 'SELECT * FROM MARA ORDER BY MATNR ASC'
}
```

## Business Impact

### New Capabilities

- **SQL Console support** — Users can now execute arbitrary SQL queries through Catalyst Edit's SQL Console feature
- **Advanced aggregations** — Full SQL flexibility enables GROUP BY, HAVING, complex expressions, and nested queries
- **Custom projections** — Select specific columns instead of always returning `SELECT *`

### Simplified Internal Architecture

The `distinct` and `count` functions now delegate to `previewData`, reducing code duplication and ensuring consistent behavior across all data preview operations.

## Technical Details

### Files Changed

| File | Change |
|------|--------|
| `src/core/adt/data.ts` | Renamed to `dataPreview.ts`; accepts `sqlQuery` instead of building SQL internally |
| `src/core/adt/distinct.ts` | Refactored to use `previewData()` internally |
| `src/core/adt/count.ts` | Refactored to use `previewData()` internally |
| `src/core/adt/queryBuilder.ts` | Deleted — no longer needed |
| `src/types/requests.ts` | Removed `Filter`, `FilterOperator`, `OrderBy` types and schemas |
| `src/index.ts` | Removed exports for deleted types |

### Code Reduction

- **Deleted**: ~90 lines (queryBuilder.ts)
- **Simplified**: `distinct.ts` reduced from ~120 lines to ~40 lines
- **Simplified**: `count.ts` reduced from ~95 lines to ~45 lines

## Commits Included

- `5e0382d` - [UPDATE] Changing dataPreview to be based on a raw SQL string, to allow the callers to build their own custom SQL.
- `1eaa4b2` - [UPDATE] Fixing some issues with the distinct values route
