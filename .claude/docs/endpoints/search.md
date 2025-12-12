# Search Endpoints

Search for SAP objects and analyze dependencies.

## Sections

- [POST /search/:query](#post-searchquery)
  - [Library Usage](#library-usage)
- [POST /where-used](#post-where-used)
  - [Library Usage](#library-usage-1)

---

## POST /search/:query

Search for objects by name pattern.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| POST | `/search/:query` | Yes |

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search pattern (URL-encoded) |

### Request Body

Array of object types to search (empty array = all types):

```json
["CLAS", "DDLS", "TABL"]
```

Common SAP object types:

| Type | Description |
|------|-------------|
| `CLAS` | ABAP Class |
| `INTF` | ABAP Interface |
| `DDLS` | CDS Data Definition |
| `DCLS` | CDS Access Control |
| `DDLX` | CDS Metadata Extension |
| `TABL` | Database Table |
| `VIEW` | Database View |
| `DTEL` | Data Element |
| `DOMA` | Domain |
| `TTYP` | Table Type |
| `FUGR` | Function Group |
| `PROG` | ABAP Program |

### Response

Array of search results:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Object name |
| `extension` | string | File extension |
| `package` | string | Containing package |
| `description` | string? | Object description |
| `objectType` | string | SAP object type code |

### Example

**Request:**
```
POST /search/Z*TEST*
```
```json
["CLAS", "DDLS"]
```

**Response:**
```json
{
    "success": true,
    "data": [
        {
            "name": "ZCL_TEST_HELPER",
            "extension": "clas.abap",
            "package": "ZDEV",
            "description": "Test helper class",
            "objectType": "CLAS"
        },
        {
            "name": "ZTEST_VIEW",
            "extension": "asddls",
            "package": "ZDEV",
            "description": "Test CDS view",
            "objectType": "DDLS"
        },
        {
            "name": "ZCL_UNIT_TEST",
            "extension": "clas.abap",
            "package": "$TMP",
            "objectType": "CLAS"
        }
    ]
}
```

**Search All Types:**
```
POST /search/MARA
```
```json
[]
```

### Search Pattern Syntax

| Pattern | Matches |
|---------|---------|
| `ZTEST` | Exact match |
| `Z*` | Starts with Z |
| `*TEST` | Ends with TEST |
| `*TEST*` | Contains TEST |
| `Z???_*` | Z + 3 chars + _ + anything |

### Errors

| Code | Status | Cause |
|------|--------|-------|
| `VALIDATION_ERROR` | 400 | Query is required or invalid types array |
| `SESSION_NOT_FOUND` | 401 | Invalid session |
| `UNKNOWN_ERROR` | 500 | Search failed |

### Use Cases

- **Object discovery** — Find objects by naming pattern
- **Type-filtered search** — Search only specific object types
- **Package exploration** — Find all Z* objects in system
- **Autocomplete** — Power object name suggestions

### Library Usage

Use the `client.search()` method to search for objects directly:

```typescript
import { createClient } from 'catalyst-relay';
import type { SearchResult } from 'catalyst-relay';

const [client, err] = await createClient({
    clientId: 'DEV',
    auth: { type: 'basic', username: 'user', password: 'pass' }
});
if (err) throw err;

// Search all types
const [results, searchErr] = await client.search('Z*TEST*');
if (searchErr) {
    console.error('Search failed:', searchErr);
    return;
}

// results: SearchResult[]
// SearchResult = {
//     name: string,
//     extension: string,
//     package: string,
//     description?: string,
//     objectType: string
// }

results.forEach(obj => {
    console.log(`${obj.name} (${obj.objectType}) - ${obj.description ?? 'No description'}`);
});

// Search specific types only
const [classes, classErr] = await client.search('Z*TEST*', ['CLAS', 'DDLS']);
if (classErr) {
    console.error('Filtered search failed:', classErr);
    return;
}

console.log(`Found ${classes.length} classes and CDS views`);
```

**Method Signature:**
```typescript
search(query: string, types?: string[]): AsyncResult<SearchResult[]>
```

**Parameters:**
- `query` — Search pattern (supports wildcards: `*`, `?`)
- `types` — Optional array of object type codes to filter results (empty/omitted = all types)

**Returns:** `AsyncResult<SearchResult[]>` — Result tuple containing search results or error

**Common Object Types:** `CLAS`, `INTF`, `DDLS`, `DCLS`, `DDLX`, `TABL`, `VIEW`, `DTEL`, `DOMA`, `TTYP`, `FUGR`, `PROG`

---

## POST /where-used

Find objects that depend on (use) the specified objects.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| POST | `/where-used` | Yes |

### Request Body

Array of object references:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Object name |
| `extension` | string | Yes | File extension |

### Response

Array of dependency arrays (one per input object):

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Dependent object name |
| `extension` | string | File extension |
| `package` | string | Containing package |
| `usageType` | string | Type of usage/dependency |

### Example

**Request:**
```json
[
    { "name": "ZCL_BASE_CLASS", "extension": "clas.abap" },
    { "name": "ZTEST_VIEW", "extension": "asddls" }
]
```

**Response:**
```json
{
    "success": true,
    "data": [
        [
            {
                "name": "ZCL_DERIVED_A",
                "extension": "clas.abap",
                "package": "ZDEV",
                "usageType": "INHERITS"
            },
            {
                "name": "ZCL_DERIVED_B",
                "extension": "clas.abap",
                "package": "ZDEV",
                "usageType": "INHERITS"
            },
            {
                "name": "ZCL_CONSUMER",
                "extension": "clas.abap",
                "package": "ZPROD",
                "usageType": "USES"
            }
        ],
        [
            {
                "name": "ZCOMPOSITE_VIEW",
                "extension": "asddls",
                "package": "ZDEV",
                "usageType": "ASSOCIATION"
            }
        ]
    ]
}
```

### Usage Types

| Type | Description |
|------|-------------|
| `INHERITS` | Class inheritance |
| `IMPLEMENTS` | Interface implementation |
| `USES` | Direct usage/reference |
| `ASSOCIATION` | CDS association |
| `COMPOSITION` | CDS composition |
| `INCLUDE` | Include relationship |
| `CALLS` | Function/method call |

### Errors

| Code | Status | Cause |
|------|--------|-------|
| `VALIDATION_ERROR` | 400 | Invalid object reference format |
| `OBJECT_NOT_FOUND` | 404 | Object does not exist |
| `SESSION_NOT_FOUND` | 401 | Invalid session |
| `UNKNOWN_ERROR` | 500 | Analysis failed |

### Use Cases

- **Impact analysis** — Find all objects affected by a change
- **Refactoring safety** — Check dependencies before modification
- **Deprecation planning** — Identify consumers of deprecated objects
- **Documentation** — Generate dependency graphs

### Library Usage

Use the `client.whereUsed()` method to analyze dependencies for a single object:

```typescript
import { createClient } from 'catalyst-relay';
import type { ObjectRef, Dependency } from 'catalyst-relay';

const [client, err] = await createClient({
    clientId: 'DEV',
    auth: { type: 'basic', username: 'user', password: 'pass' }
});
if (err) throw err;

// Analyze a single object
const obj: ObjectRef = {
    name: 'ZCL_BASE_CLASS',
    extension: 'clas.abap'
};

const [dependencies, whereUsedErr] = await client.whereUsed(obj);
if (whereUsedErr) {
    console.error('Where-used analysis failed:', whereUsedErr);
    return;
}

// dependencies: Dependency[]
// Dependency = {
//     name: string,
//     extension: string,
//     package: string,
//     usageType: string
// }

console.log(`Found ${dependencies.length} objects using ${obj.name}:`);
dependencies.forEach(dep => {
    console.log(`  ${dep.name} (${dep.usageType}) - Package: ${dep.package}`);
});

// Analyze multiple objects (call sequentially)
const objects: ObjectRef[] = [
    { name: 'ZCL_BASE_CLASS', extension: 'clas.abap' },
    { name: 'ZTEST_VIEW', extension: 'asddls' }
];

const allDeps: Dependency[][] = [];
for (const object of objects) {
    const [deps, err] = await client.whereUsed(object);
    if (err) {
        console.error(`Failed to analyze ${object.name}:`, err);
        continue;
    }
    allDeps.push(deps);
    console.log(`${object.name} has ${deps.length} dependencies`);
}

// Generate impact report
objects.forEach((obj, index) => {
    console.log(`\n${obj.name}:`);
    allDeps[index]?.forEach(dep => {
        console.log(`  - ${dep.name} (${dep.usageType})`);
    });
});
```

**Method Signature:**
```typescript
whereUsed(object: ObjectRef): AsyncResult<Dependency[]>
```

**Parameters:**
- `object` — Object reference with `name` and `extension` properties

**Returns:** `AsyncResult<Dependency[]>` — Result tuple containing dependency list or error

**Common Usage Types:** `INHERITS`, `IMPLEMENTS`, `USES`, `ASSOCIATION`, `COMPOSITION`, `INCLUDE`, `CALLS`

**Note:** The HTTP endpoint accepts an array and returns an array of dependency arrays. The library method `whereUsed()` takes a single object and returns its dependencies. To analyze multiple objects, call the method sequentially for each object as shown in the example above.
