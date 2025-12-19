# Object Endpoints

CRAUD (Create, Read, Activate, Update, Delete) operations for SAP development objects.

## Sections

- [POST /objects/read](#post-objectsread)
  - [Library Usage](#library-usage)
- [POST /objects/upsert/:package/:transport?](#post-objectsupsertpackagetransport)
  - [Library Usage](#library-usage-1)
- [POST /objects/activate](#post-objectsactivate)
  - [Library Usage](#library-usage-2)
- [DELETE /objects/:transport?](#delete-objectstransport)
  - [Library Usage](#library-usage-3)

---

## POST /objects/read

Batch read objects with their source content.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| POST | `/objects/read` | Yes |

### Request Body

Array of object references:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Object name (e.g., `ZTEST_VIEW`) |
| `extension` | string | Yes | File extension (e.g., `asddls`, `clas.abap`) |

### Response

Array of objects with content:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Object name |
| `extension` | string | File extension |
| `package` | string | Package containing object |
| `content` | string | Source code content |
| `description` | string? | Object description |
| `createdBy` | string? | Creator username |
| `createdAt` | string? | Creation timestamp |
| `modifiedBy` | string? | Last modifier username |
| `modifiedAt` | string? | Last modification timestamp |

### Example

**Request:**
```json
[
    { "name": "ZTEST_VIEW", "extension": "asddls" },
    { "name": "ZCL_HELPER", "extension": "clas.abap" }
]
```

**Response:**
```json
{
    "success": true,
    "data": [
        {
            "name": "ZTEST_VIEW",
            "extension": "asddls",
            "package": "ZDEV",
            "content": "@AbapCatalog.sqlViewName: 'ZTEST_SQL'\ndefine view ZTEST_VIEW as select from mara { ... }",
            "modifiedBy": "DEVELOPER",
            "modifiedAt": "2024-01-15T10:30:00Z"
        },
        {
            "name": "ZCL_HELPER",
            "extension": "clas.abap",
            "package": "ZDEV",
            "content": "CLASS zcl_helper DEFINITION PUBLIC FINAL CREATE PUBLIC.\n...",
            "createdBy": "DEVELOPER",
            "createdAt": "2024-01-10T08:00:00Z"
        }
    ]
}
```

### Errors

| Code | Status | Cause |
|------|--------|-------|
| `VALIDATION_ERROR` | 400 | Invalid object reference format |
| `OBJECT_NOT_FOUND` | 404 | Object does not exist |
| `SESSION_NOT_FOUND` | 401 | Invalid session |

### Use Cases

- **Batch download** — Fetch multiple objects in one request
- **Source comparison** — Read before/after versions
- **Backup** — Export object sources

### Library Usage

When using the TypeScript client library directly, use the `read()` method:

```typescript
import { createClient } from 'catalyst-relay';
import type { ObjectRef } from 'catalyst-relay';

// Create client instance
const [client, clientErr] = await createClient(config);
if (clientErr) {
    console.error('Failed to create client:', clientErr);
    return;
}

// Define objects to read
const objects: ObjectRef[] = [
    { name: 'ZTEST_VIEW', extension: 'asddls' },
    { name: 'ZCL_HELPER', extension: 'clas.abap' }
];

// Read objects
const [results, err] = await client.read(objects);
if (err) {
    console.error('Failed to read objects:', err);
    return;
}

// Process results
results.forEach(obj => {
    console.log(`${obj.name}.${obj.extension}:`);
    console.log(`  Package: ${obj.package}`);
    console.log(`  Modified by: ${obj.modifiedBy} at ${obj.modifiedAt}`);
    console.log(`  Content: ${obj.content.substring(0, 100)}...`);
});
```

**Return type:** `AsyncResult<ObjectWithContent[]>`

`ObjectWithContent` contains:
- `name` — Object name
- `extension` — File extension
- `package` — Package containing object
- `content` — Source code content
- `description?` — Object description (optional)
- `createdBy?` — Creator username (optional)
- `createdAt?` — Creation timestamp (optional)
- `modifiedBy?` — Last modifier username (optional)
- `modifiedAt?` — Last modification timestamp (optional)

---

## POST /objects/upsert/:package/:transport?

Create or update objects. Automatically handles locking and content upload.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| POST | `/objects/upsert/:package/:transport?` | Yes |

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `package` | string | Yes | Target package (e.g., `$TMP`, `ZDEV`) |
| `transport` | string | Conditional | Transport ID (required for non-`$TMP`) |

### Request Body

Array of object contents:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Object name |
| `extension` | string | Yes | File extension |
| `content` | string | Yes | Source code content |
| `description` | string | No | Transport description |

### Response

Array of upsert results:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Object name |
| `extension` | string | File extension |
| `status` | enum | `created`, `updated`, or `unchanged` |
| `transport` | string? | Transport ID used |

### Example

**Request (to $TMP):**
```
POST /objects/upsert/$TMP
```
```json
[
    {
        "name": "ZTEST_VIEW",
        "extension": "asddls",
        "content": "@AbapCatalog.sqlViewName: 'ZTEST_SQL'\ndefine view ZTEST_VIEW as select from mara { matnr, maktx }"
    }
]
```

**Request (to package with transport):**
```
POST /objects/upsert/ZDEV/DEVK900123
```
```json
[
    {
        "name": "ZCL_HELPER",
        "extension": "clas.abap",
        "content": "CLASS zcl_helper DEFINITION...",
        "description": "Added new helper method"
    }
]
```

**Response:**
```json
{
    "success": true,
    "data": [
        {
            "name": "ZTEST_VIEW",
            "extension": "asddls",
            "status": "updated",
            "transport": "DEVK900123"
        }
    ]
}
```

### Errors

| Code | Status | Cause |
|------|--------|-------|
| `VALIDATION_ERROR` | 400 | Invalid object format |
| `TRANSPORT_REQUIRED` | 400 | Non-$TMP package needs transport |
| `OBJECT_LOCKED` | 409 | Object locked by another user |
| `SESSION_NOT_FOUND` | 401 | Invalid session |

### Use Cases

- **Local development** — Use `$TMP` for quick testing (no transport)
- **Batch upload** — Create/update multiple objects at once
- **CI/CD integration** — Deploy objects with transport tracking

### Library Usage

When using the TypeScript client library directly, use the `upsert()` method:

```typescript
import { createClient } from 'catalyst-relay';
import type { ObjectContent } from 'catalyst-relay';

// Create client instance
const [client, clientErr] = await createClient(config);
if (clientErr) {
    console.error('Failed to create client:', clientErr);
    return;
}

// Define objects to upsert
const objects: ObjectContent[] = [
    {
        name: 'ZTEST_VIEW',
        extension: 'asddls',
        content: '@AbapCatalog.sqlViewName: \'ZTEST_SQL\'\ndefine view ZTEST_VIEW as select from mara { matnr, maktx }'
    }
];

// Upsert to $TMP (local, no transport)
const [results, err] = await client.upsert(objects, '$TMP');
if (err) {
    console.error('Failed to upsert objects:', err);
    return;
}

// Or upsert to package with transport
const [results2, err2] = await client.upsert(objects, 'ZDEV', 'DEVK900123');
if (err2) {
    console.error('Failed to upsert objects:', err2);
    return;
}

// Process results
results.forEach(result => {
    console.log(`${result.name}.${result.extension}: ${result.status}`);
    if (result.transport) {
        console.log(`  Transport: ${result.transport}`);
    }
});
```

**Return type:** `AsyncResult<UpsertResult[]>`

`UpsertResult` contains:
- `name` — Object name
- `extension` — File extension
- `status` — `'created'`, `'updated'`, or `'unchanged'`
- `transport?` — Transport ID used (optional)

---

## POST /objects/activate

Activate objects to make them runtime-available.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| POST | `/objects/activate` | Yes |

### Request Body

Array of object references:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Object name |
| `extension` | string | Yes | File extension |

### Response

Array of activation results:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Object name |
| `extension` | string | File extension |
| `status` | enum | `success`, `warning`, or `error` |
| `messages` | array | Activation messages |

Each message:

| Field | Type | Description |
|-------|------|-------------|
| `severity` | enum | `error`, `warning`, or `info` |
| `text` | string | Message text |
| `line` | number? | Source line number |
| `column` | number? | Source column number |

### Example

**Request:**
```json
[
    { "name": "ZTEST_VIEW", "extension": "asddls" },
    { "name": "ZCL_HELPER", "extension": "clas.abap" }
]
```

**Response:**
```json
{
    "success": true,
    "data": [
        {
            "name": "ZTEST_VIEW",
            "extension": "asddls",
            "status": "success",
            "messages": []
        },
        {
            "name": "ZCL_HELPER",
            "extension": "clas.abap",
            "status": "warning",
            "messages": [
                {
                    "severity": "warning",
                    "text": "Method 'GET_DATA' is not used",
                    "line": 45,
                    "column": 10
                }
            ]
        }
    ]
}
```

### Errors

| Code | Status | Cause |
|------|--------|-------|
| `VALIDATION_ERROR` | 400 | Invalid object reference |
| `ACTIVATION_FAILED` | 500 | Critical activation error |
| `SESSION_NOT_FOUND` | 401 | Invalid session |

### Use Cases

- **After upsert** — Activate after creating/updating objects
- **Batch activation** — Activate multiple objects together (handles dependencies)
- **CI/CD validation** — Check activation status for deployment gate

### Library Usage

When using the TypeScript client library directly, use the `activate()` method:

```typescript
import { createClient } from 'catalyst-relay';
import type { ObjectRef } from 'catalyst-relay';

// Create client instance
const [client, clientErr] = await createClient(config);
if (clientErr) {
    console.error('Failed to create client:', clientErr);
    return;
}

// Define objects to activate
const objects: ObjectRef[] = [
    { name: 'ZTEST_VIEW', extension: 'asddls' },
    { name: 'ZCL_HELPER', extension: 'clas.abap' }
];

// Activate objects
const [results, err] = await client.activate(objects);
if (err) {
    console.error('Failed to activate objects:', err);
    return;
}

// Process results
results.forEach(result => {
    console.log(`${result.name}.${result.extension}: ${result.status}`);

    if (result.messages.length > 0) {
        result.messages.forEach(msg => {
            const location = msg.line ? ` (line ${msg.line}${msg.column ? `, col ${msg.column}` : ''})` : '';
            console.log(`  [${msg.severity}]${location}: ${msg.text}`);
        });
    }
});

// Check for errors
const hasErrors = results.some(r => r.status === 'error');
if (hasErrors) {
    console.error('Activation failed with errors');
}
```

**Return type:** `AsyncResult<ActivationResult[]>`

`ActivationResult` contains:
- `name` — Object name
- `extension` — File extension
- `status` — `'success'`, `'warning'`, or `'error'`
- `messages` — Array of `ActivationMessage`

`ActivationMessage` contains:
- `severity` — `'error'`, `'warning'`, or `'info'`
- `text` — Message text
- `line?` — Source line number (optional)
- `column?` — Source column number (optional)

---

## DELETE /objects/:transport?

Delete objects from the SAP system.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| DELETE | `/objects/:transport?` | Yes |

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `transport` | string | No | Transport ID for deletion request |

### Request Body

Array of object references:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Object name |
| `extension` | string | Yes | File extension |

### Response

| Field | Type | Description |
|-------|------|-------------|
| `data` | null | Always null on success |

### Example

**Request:**
```
DELETE /objects/DEVK900123
```
```json
[
    { "name": "ZOLD_VIEW", "extension": "asddls" }
]
```

**Response:**
```json
{
    "success": true,
    "data": null
}
```

### Errors

| Code | Status | Cause |
|------|--------|-------|
| `VALIDATION_ERROR` | 400 | Invalid object reference |
| `OBJECT_LOCKED` | 409 | Object locked by another user |
| `OBJECT_NOT_FOUND` | 404 | Object does not exist |
| `SESSION_NOT_FOUND` | 401 | Invalid session |

### Use Cases

- **Cleanup** — Remove obsolete objects
- **Rename workflow** — Delete old, create new with different name
- **Transport cleanup** — Record deletion in transport request

### Library Usage

When using the TypeScript client library directly, use the `delete()` method:

```typescript
import { createClient } from 'catalyst-relay';
import type { ObjectRef } from 'catalyst-relay';

// Create client instance
const [client, clientErr] = await createClient(config);
if (clientErr) {
    console.error('Failed to create client:', clientErr);
    return;
}

// Define objects to delete
const objects: ObjectRef[] = [
    { name: 'ZOLD_VIEW', extension: 'asddls' }
];

// Delete without transport (local objects only)
const [, err] = await client.delete(objects);
if (err) {
    console.error('Failed to delete objects:', err);
    return;
}

// Or delete with transport (for transportable objects)
const [, err2] = await client.delete(objects, 'DEVK900123');
if (err2) {
    console.error('Failed to delete objects:', err2);
    return;
}

console.log('Objects deleted successfully');
```

**Return type:** `AsyncResult<void>`

The delete operation returns no data on success. Check the error tuple to determine if the operation succeeded.
