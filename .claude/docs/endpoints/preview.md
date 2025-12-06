# Preview Endpoints

Query and preview data from SAP tables and CDS views.

## Sections

- [POST /preview/data](#post-previewdata)
- [POST /preview/distinct](#post-previewdistinct)
- [POST /preview/count](#post-previewcount)

---

## POST /preview/data

Query table or CDS view data with filters, sorting, and pagination.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| POST | `/preview/data` | Yes |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `objectName` | string | Yes | Table or CDS view name |
| `objectType` | enum | Yes | `table` or `view` |
| `filters` | array | No | WHERE clause conditions |
| `orderBy` | array | No | ORDER BY columns |
| `limit` | number | No | Max rows (default: 100, max: 50000) |
| `offset` | number | No | Row offset for pagination |

**Filter Object:**

| Field | Type | Description |
|-------|------|-------------|
| `column` | string | Column name |
| `operator` | enum | `eq`, `ne`, `gt`, `ge`, `lt`, `le`, `like`, `in` |
| `value` | any | Filter value (string, number, boolean, null) |

**OrderBy Object:**

| Field | Type | Description |
|-------|------|-------------|
| `column` | string | Column name |
| `direction` | enum | `asc` or `desc` |

### Response

DataFrame structure:

| Field | Type | Description |
|-------|------|-------------|
| `columns` | array | Column metadata |
| `rows` | array[] | Row data (array of arrays) |
| `totalRows` | number? | Total matching rows (if available) |

**Column Info:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Column name |
| `dataType` | string | SAP data type |
| `label` | string? | Column label/description |

### Example

**Request:**
```json
{
    "objectName": "MARA",
    "objectType": "table",
    "filters": [
        { "column": "MTART", "operator": "eq", "value": "FERT" },
        { "column": "MATNR", "operator": "like", "value": "A%" }
    ],
    "orderBy": [
        { "column": "MATNR", "direction": "asc" }
    ],
    "limit": 50,
    "offset": 0
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "columns": [
            { "name": "MATNR", "dataType": "CHAR", "label": "Material Number" },
            { "name": "MTART", "dataType": "CHAR", "label": "Material Type" },
            { "name": "MAKTX", "dataType": "CHAR", "label": "Material Description" }
        ],
        "rows": [
            ["A001", "FERT", "Finished Product A"],
            ["A002", "FERT", "Finished Product B"],
            ["A003", "FERT", "Finished Product C"]
        ],
        "totalRows": 150
    }
}
```

### Filter Operators

| Operator | SQL Equivalent | Example |
|----------|----------------|---------|
| `eq` | `= value` | `{ "column": "STATUS", "operator": "eq", "value": "A" }` |
| `ne` | `<> value` | `{ "column": "STATUS", "operator": "ne", "value": "D" }` |
| `gt` | `> value` | `{ "column": "PRICE", "operator": "gt", "value": 100 }` |
| `ge` | `>= value` | `{ "column": "QTY", "operator": "ge", "value": 1 }` |
| `lt` | `< value` | `{ "column": "PRICE", "operator": "lt", "value": 1000 }` |
| `le` | `<= value` | `{ "column": "DATE", "operator": "le", "value": "20240101" }` |
| `like` | `LIKE value` | `{ "column": "NAME", "operator": "like", "value": "TEST%" }` |
| `in` | `IN (values)` | `{ "column": "TYPE", "operator": "in", "value": "A,B,C" }` |

### Errors

| Code | Status | Cause |
|------|--------|-------|
| `VALIDATION_ERROR` | 400 | Invalid query parameters |
| `OBJECT_NOT_FOUND` | 404 | Table/view does not exist |
| `SESSION_NOT_FOUND` | 401 | Invalid session |
| `UNKNOWN_ERROR` | 500 | Query execution failed |

### Use Cases

- **Data exploration** — Preview table contents with filters
- **Pagination** — Use `limit` and `offset` for large datasets
- **CDS view testing** — Validate view output during development
- **Export preparation** — Sample data before full export

---

## POST /preview/distinct

Get distinct values for a column with occurrence counts.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| POST | `/preview/distinct` | Yes |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `objectName` | string | Yes | Table or view name |
| `column` | string | Yes | Column to analyze |

### Response

| Field | Type | Description |
|-------|------|-------------|
| `column` | string | Column name |
| `values` | array | Distinct values with counts |

Each value entry:

| Field | Type | Description |
|-------|------|-------------|
| `value` | any | The distinct value |
| `count` | number | Number of occurrences |

### Example

**Request:**
```json
{
    "objectName": "MARA",
    "column": "MTART"
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "column": "MTART",
        "values": [
            { "value": "FERT", "count": 1523 },
            { "value": "HALB", "count": 892 },
            { "value": "ROH", "count": 445 },
            { "value": "HAWA", "count": 234 }
        ]
    }
}
```

### Errors

| Code | Status | Cause |
|------|--------|-------|
| `VALIDATION_ERROR` | 400 | Missing objectName or column |
| `OBJECT_NOT_FOUND` | 404 | Table/view does not exist |
| `SESSION_NOT_FOUND` | 401 | Invalid session |
| `UNKNOWN_ERROR` | 500 | Query execution failed |

### Use Cases

- **Filter dropdowns** — Populate filter options in UI
- **Data profiling** — Understand value distribution
- **Validation** — Check for unexpected values
- **Cardinality analysis** — Assess column uniqueness

---

## POST /preview/count

Get total row count for a table or view.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| POST | `/preview/count` | Yes |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `objectName` | string | Yes | Table or view name |
| `objectType` | enum | Yes | `table` or `view` |

### Response

| Field | Type | Description |
|-------|------|-------------|
| `data` | number | Total row count |

### Example

**Request:**
```json
{
    "objectName": "MARA",
    "objectType": "table"
}
```

**Response:**
```json
{
    "success": true,
    "data": 15234
}
```

### Errors

| Code | Status | Cause |
|------|--------|-------|
| `VALIDATION_ERROR` | 400 | Missing or invalid parameters |
| `OBJECT_NOT_FOUND` | 404 | Table/view does not exist |
| `SESSION_NOT_FOUND` | 401 | Invalid session |
| `UNKNOWN_ERROR` | 500 | Query execution failed |

### Use Cases

- **Pagination UI** — Calculate total pages
- **Data sizing** — Estimate export size
- **Validation** — Verify expected row counts
- **Monitoring** — Track table growth over time
