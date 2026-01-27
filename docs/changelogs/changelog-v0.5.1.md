# Changelog - v0.5.1

## Release Date
January 27, 2026

## Overview
Restores `parameters` support to `countRows()` and improves login error messages for better debugging.

## Breaking Changes
None.

## What's New

### Parameters Support for countRows

The `countRows()` method now accepts an optional `parameters` argument, allowing filtered row counts on parameterized CDS views:

```typescript
// Count all rows
const [count, err] = await client.countRows('ZCUSTOMER_VIEW', 'view');

// Count with parameters (e.g., for CDS views with mandatory parameters)
const [filteredCount, err] = await client.countRows('ZCUSTOMER_VIEW', 'view', [
    { name: 'P_BUKRS', value: '1000' },
    { name: 'P_GJAHR', value: '2026' }
]);
```

This was present in v0.4.6 but was inadvertently dropped during the v0.5.0 client refactoring. Now restored.

### Improved Login Error Messages

Login failures now return clearer error messages:

- **Before:** "Login failed: No CSRF token returned in response headers"
- **After:** "Invalid credentials"

The original message was technically accurate but confusing for users, since a missing CSRF token typically indicates authentication failure, not a token fetch issue.

## Technical Details

### Files Changed

**Modified:**
- `src/client/client.ts` - Added `parameters` to `countRows()` interface and implementation
- `src/client/methods/preview/countRows.ts` - Added `parameters` argument, passes to ADT function
- `src/core/adt/data_extraction/count.ts` - Uses `parametersToSQLParams()` to append parameters to SQL query
- `src/core/session/login.ts` - Improved error message clarity

### SQL Generation

The `countRows` function now generates parameterized SQL:

```sql
-- Without parameters
SELECT COUNT(*) AS row_count FROM ZTABLE

-- With parameters
SELECT COUNT(*) AS row_count FROM ZCDS_VIEW( P_BUKRS = '1000', P_GJAHR = '2026' )
```

## Commits Included
- cdd3c16 - [UPDATE] Merge branch 'main' into dev with countRows parameters restored
