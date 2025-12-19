# Changelog - v0.2.3

## Release Date
December 11, 2025

## Overview
Internal reorganization of the ADT module into logical subfolders, introduction of an optional query builder helper for SQL construction, expanded test coverage, and removal of unused configuration utilities.

## Breaking Changes
None — this release is purely additive and internal.

## Business Impact

### New Query Builder (Optional Helper)

A new `queryBuilder` module provides programmatic SQL construction for data preview operations. This is an **optional helper** — the raw SQL API introduced in v0.2.2 remains unchanged.

**Why this matters:** Callers who prefer structured query building over hand-written SQL strings can now use type-safe filter, sorting, and aggregation objects. The builder was redesigned from scratch based on real-world SQL Console usage patterns.

**Exported functions:**
- `buildSQLQuery()` — Constructs a complete SQL query from a `DataPreviewQuery` object
- `queryFiltersToWhere()` — Converts filter arrays to WHERE clauses
- `sortingsToOrderBy()` — Converts sorting arrays to ORDER BY clauses
- `fieldsToGroupbyClause()` — Generates GROUP BY clauses

**Supported filter types:**
| Type | Operators | Example |
|------|-----------|---------|
| `BasicFilter` | `=`, `<>`, `<`, `<=`, `>`, `>=`, `like`, `not like` | `MTART = 'FERT'` |
| `BetweenFilter` | `between ... and` | `AMOUNT between 100 and 500` |
| `ListFilter` | `in`, `not in` | `STATUS in ('A', 'B', 'C')` |

**Aggregation support:**
- `count`, `sum`, `avg`, `min`, `max`
- Automatic GROUP BY generation for non-aggregated fields

**Example usage:**
```typescript
import { buildSQLQuery, type DataPreviewQuery } from 'catalyst-relay';

const query: DataPreviewQuery = {
    objectName: 'MARA',
    objectType: 'table',
    fields: ['MTART', 'MATNR'],
    filters: [
        { type: 'basic', field: 'MTART', operator: '=', value: 'FERT' }
    ],
    sortings: [
        { field: 'MATNR', direction: 'asc' }
    ],
    limit: 100
};

const [result, err] = buildSQLQuery(query);
// result.sqlQuery contains the generated SQL
```

### Expanded Test Coverage

Two previously untested areas now have comprehensive unit tests:
- **Query Builder** — 736 lines covering all filter types, operators, edge cases, and validation
- **Session Login** — 357 lines covering authentication flows

## Technical Details

### ADT Module Reorganization

The flat `src/core/adt/` structure has been reorganized into logical subfolders for maintainability:

```
src/core/adt/
├── craud/              # Create, Read, Activate, Update, Delete
│   ├── activation.ts
│   ├── create.ts
│   ├── delete.ts
│   ├── gitDiff.ts
│   ├── lock.ts
│   ├── read.ts
│   └── update.ts
│
├── data_extraction/    # Data preview operations
│   ├── count.ts
│   ├── dataPreview.ts
│   ├── distinct.ts
│   ├── previewParser.ts
│   └── queryBuilder.ts  # NEW
│
├── discovery/          # Package/tree browsing, search
│   ├── packages.ts
│   ├── searchObjects.ts
│   ├── tree.ts
│   └── whereUsed.ts
│
└── transports/         # Transport management
    ├── createTransport.ts
    └── transports.ts
```

**No impact on library consumers** — all exports remain available from `catalyst-relay` at the same paths.

### Dead Code Removal

Deleted `src/core/config.ts` (294 lines) — a configuration lookup system ported from the Python reference that was never used. The current approach passes URLs directly to the client rather than resolving them from a config file.

### Testing Infrastructure

- Documented required environment variables for integration tests in `.claude/docs/testing.md`
- Updated `.env.templ` with clearer variable names
- Simplified `test.bat` and integration test helpers

## Commits Included

- `cb27725` - [UPDATE] Working on new tests
- `1b3f173` - [UPDATE] Segmenting the adt folder a bit
- `05d2707` - [UPDATE] Reorganization
- `163b64a` - [UPDATE] Starting to work on building out an auto query builder
- `9b4d271` - Merge branch 'main' into dev
- `7fa9abd` - [UPDATE] Starting on data_preview types
- `1c94112` - [UPDATE] Simplifying the testing configuration
