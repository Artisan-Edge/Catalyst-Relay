# Preview Endpoints

Query and preview data from SAP tables and CDS views.

## Sections

- [POST /preview/data](#post-previewdata)
  - [Library Usage](#library-usage)
- [POST /preview/distinct](#post-previewdistinct)
  - [Library Usage](#library-usage-1)
- [POST /preview/count](#post-previewcount)
  - [Library Usage](#library-usage-2)

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

### Library Usage

When using Catalyst-Relay as a TypeScript library, call `client.previewData()` to execute SQL queries:

```typescript
import { createClient, type PreviewSQL, type AsyncResult, type DataFrame } from 'catalyst-relay';

// Create authenticated client
const client = createClient({
    host: 'https://sap-server.example.com',
    client: '100',
    authStrategy: 'basic',
    credentials: { username: 'developer', password: 'password' }
});

const [_, loginErr] = await client.login();
if (loginErr) {
    console.error('Login failed:', loginErr.message);
    process.exit(1);
}

// Execute data preview query
const query: PreviewSQL = {
    objectName: 'MARA',
    objectType: 'table',
    sqlQuery: "SELECT MATNR, MTART, MAKTX FROM MARA WHERE MTART = 'FERT' AND MATNR LIKE 'A%' ORDER BY MATNR ASC",
    limit: 50  // optional, default 100, max 50000
};

const [dataFrame, err] = await client.previewData(query);
if (err) {
    console.error('Query failed:', err.message);
    process.exit(1);
}

// DataFrame structure
console.log('Columns:', dataFrame.columns);
// [
//   { name: 'MATNR', dataType: 'CHAR', label: 'Material Number' },
//   { name: 'MTART', dataType: 'CHAR', label: 'Material Type' },
//   { name: 'MAKTX', dataType: 'CHAR', label: 'Material Description' }
// ]

console.log('Rows:', dataFrame.rows);
// [
//   ['A001', 'FERT', 'Finished Product A'],
//   ['A002', 'FERT', 'Finished Product B'],
//   ['A003', 'FERT', 'Finished Product C']
// ]

console.log('Total rows:', dataFrame.totalRows);  // 150 (if available)
```

**Type Definitions:**

```typescript
interface PreviewSQL {
    objectName: string;
    objectType: 'table' | 'view';
    sqlQuery: string;
    limit?: number;  // default: 100, max: 50000
}

interface DataFrame {
    columns: ColumnInfo[];
    rows: any[][];
    totalRows?: number;
}

interface ColumnInfo {
    name: string;
    dataType: string;
    label?: string;
}

type AsyncResult<T> = Promise<[T, null] | [null, Error]>;
```

**Error Handling:**

The method returns an `AsyncResult` tuple. Always check for errors:

```typescript
const [dataFrame, err] = await client.previewData(query);
if (err) {
    // Handle specific error cases
    if (err.message.includes('not found')) {
        console.error('Table/view does not exist');
    } else if (err.message.includes('SQL')) {
        console.error('Invalid SQL syntax');
    } else {
        console.error('Query failed:', err.message);
    }
    return;
}

// Safe to use dataFrame here
console.log(`Retrieved ${dataFrame.rows.length} rows`);
```

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
| `parameters` | array | No | CDS view parameters (default: `[]`) |
| `column` | string | Yes | Column to analyze |

**Parameter Object:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Parameter name |
| `value` | string | Yes | Parameter value |

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

**Request (table):**
```json
{
    "objectName": "MARA",
    "objectType": "table",
    "column": "MTART"
}
```

**Request (CDS view with parameters):**
```json
{
    "objectName": "I_JOURNALENTRY",
    "objectType": "view",
    "parameters": [
        { "name": "P_FISCALYEAR", "value": "2024" }
    ],
    "column": "CompanyCode"
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

### Library Usage

When using Catalyst-Relay as a TypeScript library, call `client.getDistinctValues()` to analyze column values:

```typescript
import { createClient, type Parameter, type AsyncResult, type DistinctResult } from 'catalyst-relay';

// Create authenticated client
const client = createClient({
    host: 'https://sap-server.example.com',
    client: '100',
    authStrategy: 'basic',
    credentials: { username: 'developer', password: 'password' }
});

await client.login();

// Example 1: Get distinct values from a table
const [result, err] = await client.getDistinctValues(
    'MARA',      // objectName
    [],          // parameters (empty for tables)
    'MTART',     // column
    'table'      // objectType (optional, defaults to 'view')
);

if (err) {
    console.error('Query failed:', err.message);
    process.exit(1);
}

console.log(`Distinct values for ${result.column}:`);
result.values.forEach(({ value, count }) => {
    console.log(`  ${value}: ${count} occurrences`);
});
// Output:
//   FERT: 1523 occurrences
//   HALB: 892 occurrences
//   ROH: 445 occurrences
//   HAWA: 234 occurrences

// Example 2: Get distinct values from a CDS view with parameters
const params: Parameter[] = [
    { name: 'P_FISCALYEAR', value: '2024' }
];

const [viewResult, viewErr] = await client.getDistinctValues(
    'I_JOURNALENTRY',  // CDS view name
    params,            // view parameters
    'CompanyCode',     // column to analyze
    'view'             // objectType
);

if (viewErr) {
    console.error('View query failed:', viewErr.message);
    process.exit(1);
}

// Process distinct company codes
const companyCodes = viewResult.values.map(v => v.value);
console.log('Available company codes:', companyCodes);
```

**Method Signature:**

```typescript
async getDistinctValues(
    objectName: string,
    parameters: Parameter[],
    column: string,
    objectType?: 'table' | 'view'  // defaults to 'view'
): AsyncResult<DistinctResult>
```

**Type Definitions:**

```typescript
interface Parameter {
    name: string;   // Parameter name (e.g., 'P_FISCALYEAR')
    value: string;  // Parameter value (e.g., '2024')
}

interface DistinctResult {
    column: string;
    values: Array<{
        value: any;     // The distinct value
        count: number;  // Number of occurrences
    }>;
}

type AsyncResult<T> = Promise<[T, null] | [null, Error]>;
```

**Common Patterns:**

```typescript
// Pattern 1: Build filter dropdown options
const [result, err] = await client.getDistinctValues('MARA', [], 'MTART', 'table');
if (!err) {
    const options = result.values.map(({ value, count }) => ({
        label: `${value} (${count})`,
        value: value
    }));
    // Use options in UI dropdown
}

// Pattern 2: Find most common values
const [result, err] = await client.getDistinctValues('SALES', [], 'REGION', 'table');
if (!err) {
    const sorted = result.values.sort((a, b) => b.count - a.count);
    console.log('Top 5 regions:', sorted.slice(0, 5));
}

// Pattern 3: Validate expected values
const [result, err] = await client.getDistinctValues('CONFIG', [], 'STATUS', 'table');
if (!err) {
    const validStatuses = ['ACTIVE', 'INACTIVE', 'PENDING'];
    const invalid = result.values.filter(v => !validStatuses.includes(v.value));
    if (invalid.length > 0) {
        console.warn('Unexpected status values:', invalid);
    }
}
```

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

### Library Usage

When using Catalyst-Relay as a TypeScript library, call `client.countRows()` to get row counts:

```typescript
import { createClient, type AsyncResult } from 'catalyst-relay';

// Create authenticated client
const client = createClient({
    host: 'https://sap-server.example.com',
    client: '100',
    authStrategy: 'basic',
    credentials: { username: 'developer', password: 'password' }
});

await client.login();

// Get row count for a table
const [count, err] = await client.countRows('MARA', 'table');

if (err) {
    console.error('Count query failed:', err.message);
    process.exit(1);
}

console.log(`Total rows in MARA: ${count}`);
// Output: Total rows in MARA: 15234
```

**Method Signature:**

```typescript
async countRows(
    objectName: string,
    objectType: 'table' | 'view'
): AsyncResult<number>
```

**Type Definitions:**

```typescript
type AsyncResult<T> = Promise<[T, null] | [null, Error]>;
```

**Common Patterns:**

```typescript
// Pattern 1: Calculate pagination
const [totalRows, err] = await client.countRows('SALES', 'table');
if (!err) {
    const pageSize = 100;
    const totalPages = Math.ceil(totalRows / pageSize);
    console.log(`Total pages: ${totalPages}`);
}

// Pattern 2: Estimate export size
const [count, err] = await client.countRows('TRANSACTIONS', 'table');
if (!err) {
    const estimatedSizeMB = (count * 0.5) / 1024;  // Assume ~500 bytes per row
    console.log(`Estimated export size: ${estimatedSizeMB.toFixed(2)} MB`);

    if (estimatedSizeMB > 100) {
        console.warn('Large export - consider filtering or batching');
    }
}

// Pattern 3: Validate expected counts
const [count, err] = await client.countRows('CONFIG', 'table');
if (!err) {
    const expectedMin = 10;
    const expectedMax = 100;

    if (count < expectedMin) {
        console.error(`Too few rows: ${count} (expected at least ${expectedMin})`);
    } else if (count > expectedMax) {
        console.warn(`Unexpected row count: ${count} (expected max ${expectedMax})`);
    } else {
        console.log(`Row count within expected range: ${count}`);
    }
}

// Pattern 4: Monitor table growth
async function trackGrowth(tableName: string) {
    const [count, err] = await client.countRows(tableName, 'table');
    if (err) {
        console.error('Count failed:', err.message);
        return;
    }

    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${tableName}: ${count} rows`);

    // Store in monitoring system
    // await monitoring.recordMetric({ table: tableName, count, timestamp });
}

// Pattern 5: Batch operations based on size
const [count, err] = await client.countRows('ORDERS', 'table');
if (!err) {
    const batchSize = 1000;
    const numBatches = Math.ceil(count / batchSize);

    console.log(`Processing ${count} rows in ${numBatches} batches`);

    for (let i = 0; i < numBatches; i++) {
        const offset = i * batchSize;
        console.log(`Processing batch ${i + 1}/${numBatches} (offset: ${offset})`);
        // Process batch with LIMIT and OFFSET
    }
}
```

**Error Handling:**

```typescript
const [count, err] = await client.countRows('MARA', 'table');
if (err) {
    // Handle specific error cases
    if (err.message.includes('not found')) {
        console.error('Table/view does not exist');
    } else if (err.message.includes('timeout')) {
        console.error('Query timed out - table may be very large');
    } else {
        console.error('Count query failed:', err.message);
    }
    return;
}

// Safe to use count here
console.log(`Total rows: ${count}`);
```

---

*Last updated: v0.4.5*
