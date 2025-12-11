# Preview Endpoints

Query and preview data from SAP tables and CDS views.

## Sections

- [POST /preview/data](#post-previewdata)
- [POST /preview/distinct](#post-previewdistinct)
- [POST /preview/count](#post-previewcount)

---

## POST /preview/data

Execute SQL queries against table or CDS view data.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| POST | `/preview/data` | Yes |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `objectName` | string | Yes | Table or CDS view name |
| `objectType` | enum | Yes | `table` or `view` |
| `sqlQuery` | string | Yes | SQL query to execute |
| `limit` | number | No | Max rows (default: 100, max: 50000) |

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
    "sqlQuery": "SELECT MATNR, MTART, MAKTX FROM MARA WHERE MTART = 'FERT' AND MATNR LIKE 'A%' ORDER BY MATNR ASC",
    "limit": 50
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

### SQL Query Guidelines

The `sqlQuery` parameter accepts ABAP Open SQL syntax. Some notes:

- **No quoted identifiers** — SAP ADT does not support quoted identifiers for object/column names
- **Case insensitive** — Column and table names are case-insensitive
- **Standard clauses** — Support for SELECT, WHERE, ORDER BY, GROUP BY, HAVING
- **Aggregations** — COUNT, SUM, AVG, MIN, MAX, etc.

**Example queries:**

```sql
-- Simple select all
SELECT * FROM MARA

-- Filtered with sorting
SELECT * FROM MARA WHERE MTART = 'FERT' ORDER BY MATNR ASC

-- Specific columns
SELECT MATNR, MTART FROM MARA WHERE MATNR LIKE 'A%'

-- Aggregation
SELECT MTART, COUNT(*) AS count FROM MARA GROUP BY MTART

-- Complex conditions
SELECT * FROM MARA WHERE (MTART = 'FERT' OR MTART = 'HALB') AND MATNR LIKE 'A%'
```

### Errors

| Code | Status | Cause |
|------|--------|-------|
| `VALIDATION_ERROR` | 400 | Invalid query parameters or missing sqlQuery |
| `OBJECT_NOT_FOUND` | 404 | Table/view does not exist |
| `SESSION_NOT_FOUND` | 401 | Invalid session |
| `UNKNOWN_ERROR` | 500 | Query execution failed (check SQL syntax) |

### Use Cases

- **SQL Console** — Execute arbitrary queries from Catalyst Edit
- **Data exploration** — Preview table contents with custom filtering
- **Aggregation queries** — GROUP BY, COUNT, SUM for data analysis
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
| `objectType` | enum | No | `table` or `view` (default: `view`) |
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
    "objectType": "table",
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
