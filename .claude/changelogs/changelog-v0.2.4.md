# Changelog - v0.2.4

## Release Date
December 16, 2025

## Overview
This release adds parameterized CDS view support to the distinct values endpoint, exports query builder utilities for library consumers, and fixes the sorting direction syntax.

## Business Impact

### Parameterized CDS View Support
The distinct values endpoint (`POST /preview/distinct`) now accepts an optional `parameters` array, enabling queries against CDS views that require input parameters. This was a gap that prevented using distinct value analysis on parameterized views.

**Example request:**
```json
{
    "objectName": "Z_MY_CDS_VIEW",
    "parameters": [
        { "name": "P_BUKRS", "value": "1000" }
    ],
    "column": "MATNR"
}
```

### Improved Distinct Value Results
Distinct values are now automatically ordered by count descending, so the most common values appear first. This makes the results immediately useful for data analysis without client-side sorting.

### Query Builder Exports for Library Consumers
Library mode users can now import the query builder utilities directly:

```typescript
import {
    buildSQLQuery,
    type DataPreviewQuery,
    type Parameter,
    type QueryFilter,
    type Sorting
} from 'catalyst-relay';
```

This enables consumers to programmatically construct data preview queries rather than writing raw SQL strings.

## Technical Details

### Bug Fix: Sorting Direction Syntax
Fixed the `Sorting.direction` type from `"asc" | "desc"` to `"ascending" | "descending"`. The previous values did not work correctly with SAP ADT's SQL dialect.

### Build Script Fix
Removed the `--experimental-strip-types` flag from the Node.js compatibility test script to resolve a version compatibility issue.

### New Exports
- `buildSQLQuery()` - Construct SQL queries from a structured object
- `Parameter` type - Name/value pair for CDS view parameters
- `DataPreviewQuery` type - Full query specification
- `QueryFilter`, `BasicFilter`, `BetweenFilter`, `ListFilter` types - Filter definitions
- `Sorting`, `Aggregation` types - Sorting and aggregation definitions

### Internal Changes
- Exported helper functions from `queryBuilder.ts`: `quoteString`, `basicFilterToWhere`, `betweenFilterToWhere`, `listFilterToWhere`
- Added `parametersToSQLParams()` utility for formatting parameter syntax

## Documentation
- Added library usage documentation
- Updated endpoint documentation for preview routes

## Commits Included
- `2e9cbd3` - [DOCUMENTATION] Adding documentation for the library usage
- `5f55dbc` - [UPDATE] Adding ordering and support for parameterized views to the distinct values path
- `4ff5dcb` - [UPDATE] Exporting parameter
- `5577ab5` - [UPDATE] Exporting some of the relevant data types
- `19eb99a` - [HOTFIX] Changing build script
