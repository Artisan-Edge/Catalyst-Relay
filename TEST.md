# Integration Test Debugging Notes

This document captures all debugging efforts, fixes applied, and remaining issues for the integration test suite.

## Test Execution

Run integration tests with:
```bash
./test.bat <SAP_PASSWORD>
```

Results are saved to `test.output`.

## Summary of Test Status

| Workflow | Status | Notes |
|----------|--------|-------|
| abap-class-workflow | ✅ PASSING | All 6 tests pass |
| abap-program-workflow | ✅ PASSING | All 4 tests pass |
| cds-workflow | ✅ PASSING | All 8 tests pass |
| upsert-workflow | ✅ PASSING | All 4 tests pass |
| discovery-workflow | ✅ PASSING | All 3 tests pass |
| table-workflow | ✅ PASSING | All 6 tests pass |
| data-preview-workflow | ⚠️ PARTIAL | 2/3 pass, getDistinctValues fails |
| search-workflow | ❌ FAILING | 1/3 pass (whereUsed), search fails |

## Fixes Applied

### 1. Data Preview SQL Syntax (FIXED)

**Files:** `src/core/adt/count.ts`, `src/core/adt/distinct.ts`

**Problem:** Using `quoteIdentifier()` which wraps names in double quotes. SAP ADT data preview uses ABAP Open SQL which does NOT support quoted identifiers.

**Fix:** Removed `quoteIdentifier()` usage - use plain table/column names.

```typescript
// WRONG
const sqlQuery = `SELECT COUNT(*) AS count FROM ${quoteIdentifier(objectName)}`;

// CORRECT
const sqlQuery = `SELECT COUNT(*) AS count FROM ${objectName}`;
```

**SAP ADT SQL Notes:**
- No quoted identifiers (no double quotes around names)
- Uses `table~field` syntax for joins (tilde, not dot)
- Case insensitive, typically uppercase
- Very particular about spaces

### 2. Discovery XML Format (FIXED)

**File:** `src/core/adt/tree.ts`

**Problem:** Wrong XML structure for virtualfolders endpoint.

**Old (Wrong):**
```xml
<vfs:vfsRequest xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders">
    <vfs:virtualFolder>
        <vfs:package>..ZTMP</vfs:package>
    </vfs:virtualFolder>
    <vfs:facets>
        <vfs:facet>PACKAGE</vfs:facet>
    </vfs:facets>
    <vfs:searchPattern>*</vfs:searchPattern>
</vfs:vfsRequest>
```

**New (Correct):**
```xml
<vfs:virtualFoldersRequest xmlns:vfs="http://www.sap.com/adt/ris/virtualFolders" objectSearchPattern="*">
  <vfs:preselection facet="package">
    <vfs:value>..ZTMP</vfs:value>
  </vfs:preselection>
  <vfs:facetorder>
    <vfs:facet>package</vfs:facet>
  </vfs:facetorder>
</vfs:virtualFoldersRequest>
```

**Key differences:**
- Root element: `vfsRequest` → `virtualFoldersRequest`
- Search pattern: child element → XML attribute `objectSearchPattern="*"`
- Preselection: `<vfs:virtualFolder>` → individual `<vfs:preselection facet="...">` elements
- Facets container: `<vfs:facets>` → `<vfs:facetorder>`
- Facet names: uppercase → lowercase

### 3. Table Name Length (FIXED)

**File:** `src/__tests__/integration/table-workflow.test.ts`

**Problem:** SAP table names have 16-character max. `ZSNAP_TABL_XXXXXXXX` = 19 chars.

**Fix:** Changed prefix from `ZSNAP_TABL` to `ZST` (resulting in 12 chars).

### 4. COUNT Response Parsing (FIXED)

**File:** `src/core/adt/count.ts`

**Problem:** COUNT queries return different XML structure without column metadata. The `parseDataPreview()` function expected columns.

**Fix:** Extract count directly from `dataPreview:data` elements:

```typescript
const dataElements = doc.getElementsByTagNameNS('http://www.sap.com/adt/dataPreview', 'data');
const countText = dataElements[0]?.textContent?.trim();
const count = parseInt(countText, 10);
```

### 5. whereUsed Test Object (FIXED)

**File:** `src/__tests__/integration/search-workflow.test.ts`

**Problem:** T000 table has thousands of references, causing 5000ms timeout.

**Fix:** Changed to `P_APJrnlEntrItmAgingGrid4` which has minimal references.

### 6. getDistinctValues objectType Parameter (FIXED)

**Files:** `src/core/client.ts`, `src/__tests__/integration/data-preview-workflow.test.ts`

**Problem:** Test called `getDistinctValues('T000', 'MTEXT')` without specifying `objectType`. Defaulted to 'view' which uses wrong endpoint (`cds` instead of `ddic`).

**Fix:**
- Added optional `objectType` parameter to client interface
- Updated test to pass `'table'` as third argument

## Remaining Issues

### 1. getDistinctValues Parsing (IN PROGRESS)

**File:** `src/core/adt/distinct.ts`

**Error:** `No columns found in preview response`

**Status:** Applied same fix as countRows - extract data directly from `dataPreview:dataSet/dataPreview:data` elements. NOT YET TESTED.

**Current implementation:**
```typescript
const dataSets = doc.getElementsByTagNameNS('http://www.sap.com/adt/dataPreview', 'dataSet');
for (let i = 0; i < dataSets.length; i++) {
    const dataSet = dataSets[i];
    if (!dataSet) continue;

    const dataElements = dataSet.getElementsByTagNameNS('http://www.sap.com/adt/dataPreview', 'data');
    if (dataElements.length < 2) continue;

    const value = dataElements[0]?.textContent ?? '';
    const countText = dataElements[1]?.textContent?.trim() ?? '0';
    values.push({ value, count: parseInt(countText, 10) });
}
```

### 2. Search - ris_request_type Parameter (UNSOLVED)

**File:** `src/core/adt/searchObjects.ts`

**Error:** `Search failed: Parameter ris_request_type could not be found.`

**Mystery:** This error occurs whether or not we include the parameter!

**Values tried:**
- No parameter at all → same error
- `ris_request_type=quickSearch` → same error
- `ris_request_type=quick` → NOT YET TESTED

**Python reference (works):**
```python
params = [
    ('operation', 'quickSearch'),
    ('query',  query),
    ('maxResults', '10001')
]
params.extend([('objectType', t) for t in obj_types])
```

Python does NOT include `ris_request_type`, yet the TypeScript version fails without it AND with it.

**Theories:**
1. SAP system version difference - this system may require parameter that Python's test system doesn't
2. Request encoding difference between Python httpx and TypeScript fetch
3. Header difference
4. The error message may be misleading

**Next steps to try:**
- Compare raw HTTP requests between Python and TypeScript
- Try different `ris_request_type` values: `'search'`, `'QUICK_SEARCH'`, etc.
- Check if there's a header difference
- Test Python implementation against the SAME SAP system to confirm it works

## Reference: Python Implementation Locations

| Feature | Python File | Line |
|---------|-------------|------|
| Search | `snap_relay_api/clients/adt/client.py` | 738-751 |
| Count rows | `snap_relay_api/clients/adt/client.py` | 620-657 |
| Distinct values | `snap_relay_api/clients/adt/client.py` | 590-618 |
| Tree/Packages | `snap_relay_api/clients/adt/utils/tree_discovery_utils.py` | 4-17 |
| Extract total rows | `snap_relay_api/clients/adt/utils/xml_utils.py` | 173-192 |

## Reference: SAP ADT Endpoints

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Search | GET | `/sap/bc/adt/repository/informationsystem/search` |
| Where-used | POST | `/sap/bc/adt/repository/informationsystem/usageReferences` |
| Tree/Packages | POST | `/sap/bc/adt/repository/informationsystem/virtualfolders/contents` |
| Data preview (table) | POST | `/sap/bc/adt/datapreview/ddic` |
| Data preview (CDS) | POST | `/sap/bc/adt/datapreview/cds` |
| Transports | POST | `/sap/bc/adt/cts/transportchecks` |

## Key Insights

1. **ABAP Open SQL ≠ Standard SQL** - No quoted identifiers, different syntax rules
2. **SAP XML namespaces are strict** - Element names, attributes, and structure must match exactly
3. **COUNT/GROUP BY queries return simplified XML** - No column metadata, just data elements
4. **SAP object name limits vary by type:**
   - Tables: 16 characters
   - CDS Views: 30 characters
   - Classes/Programs: 30 characters
5. **Some SAP systems may require undocumented parameters** - The `ris_request_type` issue suggests system version differences
