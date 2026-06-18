# Object Endpoints

CRAUD (Create, Read, Activate, Update, Delete) operations for SAP development objects.

## Sections

- [POST /objects/read](#post-objectsread)
  - [Library Usage](#library-usage)
- [POST /objects/upsert/:package/:transport?](#post-objectsupsertpackagetransport)
  - [Library Usage](#library-usage-1)
- [POST /objects/class-include](#post-objectsclass-include)
  - [Library Usage](#library-usage-2)
- [POST /objects/activate](#post-objectsactivate)
  - [Library Usage](#library-usage-3)
- [POST /objects/check](#post-objectscheck)
  - [Library Usage](#library-usage-4)
- [DELETE /objects/:transport?](#delete-objectstransport)
  - [Library Usage](#library-usage-5)

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

## POST /objects/class-include

Write a global class's local-source include — the *Local Types* (CCIMP), *Local Definitions* (CCDEF), *Macros* (CCMAC), or *Test Classes* (CCAU) section. `upsert`/`update` only write a class's **main source**; this endpoint targets the includes, which is where RAP behaviour handlers (`CL_ABAP_BEHAVIOR_HANDLER` subclasses) must live. Locking the class, the include PUT, and unlocking are handled automatically. Activate the class afterwards to compile the change.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| POST | `/objects/class-include` | Yes |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `className` | string | Yes | Global class name (e.g., `ZBEACON_G_BEHAVIORDEFINITION`) |
| `includeType` | enum | Yes | `definitions`, `implementations`, `macros`, or `testclasses` |
| `source` | string | Yes | Include source (replaces the entire include) |
| `transport` | string | No | Transport request (required for non-`$TMP` packages) |

### Response

| Field | Type | Description |
|-------|------|-------------|
| `className` | string | Class written |
| `includeType` | string | Include section written |

### Example

**Request:**
```
POST /objects/class-include
```
```json
{
    "className": "ZBEACON_G_BEHAVIORDEFINITION",
    "includeType": "implementations",
    "source": "CLASS lhc_docs DEFINITION INHERITING FROM cl_abap_behavior_handler.\n  ...\nENDCLASS.\n\nCLASS lhc_docs IMPLEMENTATION.\n  ...\nENDCLASS.",
    "transport": "SDSK900342"
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "className": "ZBEACON_G_BEHAVIORDEFINITION",
        "includeType": "implementations"
    }
}
```

### Errors

| Code | Status | Cause |
|------|--------|-------|
| `VALIDATION_ERROR` | 400 | Invalid body (bad `includeType`, missing fields) |
| `OBJECT_LOCKED` | 409 | Class locked by another user |
| `SESSION_NOT_FOUND` | 401 | Invalid session |
| `UNKNOWN_ERROR` | 500 | Lock / write / unlock failed |

### Use Cases

- **RAP behaviour handlers** — author the `lhc_*` handler in the *Local Types* include of a behaviour pool class
- **Local test classes** — push unit tests into the *Test Classes* (CCAU) include
- **Local helper types** — define local classes/interfaces the global class depends on

### Library Usage

When using the TypeScript client library directly, use the `writeClassInclude()` method:

```typescript
import { createClient } from 'catalyst-relay';
import type { ClassIncludeType } from 'catalyst-relay';

const [client, clientErr] = createClient(config);
if (clientErr) throw clientErr;
await client.login();

const handlerSource = `CLASS lhc_docs DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS recordtotransport FOR MODIFY
      IMPORTING keys FOR ACTION docs~recordtotransport RESULT result.
ENDCLASS.
CLASS lhc_docs IMPLEMENTATION.
  METHOD recordtotransport.
    " ...
  ENDMETHOD.
ENDCLASS.`;

const [, err] = await client.writeClassInclude(
    'ZBEACON_G_BEHAVIORDEFINITION',
    'implementations',
    handlerSource,
    'SDSK900342'
);
if (err) {
    console.error('Failed to write class include:', err.message);
    return;
}

// Activate the class afterwards to compile the handler.
await client.activate([{ name: 'ZBEACON_G_BEHAVIORDEFINITION', extension: 'aclass' }]);
```

**Return type:** `AsyncResult<void>`

`includeType` is a `ClassIncludeType`:
- `'definitions'` — Class-relevant Local Definitions (CCDEF)
- `'implementations'` — Local Types (CCIMP) — where RAP behaviour handlers live
- `'macros'` — Macros (CCMAC)
- `'testclasses'` — Test Classes (CCAU)

---

## POST /objects/activate

Activate objects to make them runtime-available. Uses SAP's run-based flow — `POST /activation/runs` to start the run, long-polled `GET /activation/runs/{id}` until it completes, then `GET /activation/results/{id}` for the per-object outcomes — so the response reflects the true post-activation state instead of returning before SAP has finished.

A single batch may mix object extensions (e.g. activate a DDLS, a class, and an include in one call).

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

## POST /objects/check

Syntax check objects for errors and warnings without activating them. Reads the source from SAP and sends it inline for checking.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| POST | `/objects/check` | Yes |

### Request Body

Array of object references:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Object name |
| `extension` | string | Yes | File extension |

All objects in a single request must share the same extension.

### Response

Array of check results:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Object name |
| `extension` | string | File extension |
| `status` | enum | `success`, `warning`, or `error` |
| `messages` | array | Check messages |

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
    { "name": "ZMYPROGRAM", "extension": "asprog" }
]
```

**Response (with errors):**
```json
{
    "success": true,
    "data": [
        {
            "name": "ZMYPROGRAM",
            "extension": "asprog",
            "status": "error",
            "messages": [
                {
                    "severity": "error",
                    "text": "Variable \"LV_UNDEFINED\" is unknown",
                    "line": 4,
                    "column": 1
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
| `CHECK_FAILED` | 500 | Syntax check request failed |
| `SESSION_NOT_FOUND` | 401 | Invalid session |

### Use Cases

- **AI agent validation** — Check generated code for syntax errors before activation
- **Pre-activation gate** — Validate objects without side effects
- **Error diagnostics** — Get line/column positions for errors and warnings

### Library Usage

```typescript
import { createClient } from 'catalyst-relay';
import type { ObjectRef } from 'catalyst-relay';

const [client, clientErr] = createClient(config);
if (clientErr) throw clientErr;
await client.login();

const objects: ObjectRef[] = [
    { name: 'ZMYPROGRAM', extension: 'asprog' }
];

const [results, err] = await client.checkSyntax(objects);
if (err) {
    console.error('Check failed:', err.message);
    return;
}

results.forEach(result => {
    console.log(`${result.name}: ${result.status}`);
    result.messages.forEach(msg => {
        const loc = msg.line ? ` (line ${msg.line}, col ${msg.column})` : '';
        console.log(`  [${msg.severity}]${loc}: ${msg.text}`);
    });
});
```

**Return type:** `AsyncResult<CheckResult[]>`

`CheckResult` contains:
- `name` — Object name
- `extension` — File extension
- `status` — `'success'`, `'warning'`, or `'error'`
- `messages` — Array of `ActivationMessage`

---

## DELETE /objects/:transport?

Multi-delete with where-used dependency analysis. Independent objects are deleted in parallel; dependent objects are sequenced into waves so referencers go before referents. Partial failures do not abort the batch — every object is attempted and the per-object outcome is reported in the response.

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

`data` is an array of per-object results:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Object name |
| `extension` | string | File extension |
| `status` | enum | `success` or `error` |
| `message` | string? | Error message (when `status` is `error`) |

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
    "data": [
        { "name": "ZOLD_VIEW", "extension": "asddls", "status": "success" }
    ]
}
```

**External references blocked the operation (409):**

If any object in the deletion set is referenced by an object **outside** the set, the operation is refused before any deletes are attempted. The `references` payload is intended to be surfaced to the user so they can extend the deletion set and retry — there is no force/cascade flag.

```json
{
    "success": false,
    "error": "Cannot delete: 1 external reference(s) prevent the operation",
    "code": "EXTERNAL_REFERENCES",
    "references": [
        {
            "object": { "name": "ZCL_HELPER", "extension": "clas.abap" },
            "referencedBy": { "name": "ZCL_CONSUMER", "extension": "clas.abap" }
        }
    ]
}
```

### Errors

| Code | Status | Cause |
|------|--------|-------|
| `VALIDATION_ERROR` | 400 | Invalid object reference |
| `EXTERNAL_REFERENCES` | 409 | Objects outside the set still reference the targets |
| `OBJECT_LOCKED` | 409 | Object locked by another user |
| `OBJECT_NOT_FOUND` | 404 | Object does not exist |
| `SESSION_NOT_FOUND` | 401 | Invalid session |

### Use Cases

- **Cleanup** — Remove obsolete objects
- **Rename workflow** — Delete old, create new with different name
- **Transport cleanup** — Record deletion in transport request

### Library Usage

When using the TypeScript client library directly, use the `delete()` method. The top-level error covers operations that abort the whole batch (e.g. external references block the delete); per-object outcomes are in the returned array.

```typescript
import { createClient, ExternalReferencesError } from 'catalyst-relay';
import type { ObjectRef, DeleteResult } from 'catalyst-relay';

const [client, clientErr] = createClient(config);
if (clientErr) throw clientErr;
await client.login();

const objects: ObjectRef[] = [
    { name: 'ZOLD_VIEW', extension: 'asddls' }
];

const [results, error] = await client.delete(objects, 'DEVK900123');

if (error) {
    if (error instanceof ExternalReferencesError) {
        // Surface external references to the user so they can extend the set.
        for (const ref of error.references) {
            console.error(`${ref.object.name} is still used by ${ref.referencedBy.name}`);
        }
        return;
    }
    console.error('Delete failed:', error.message);
    return;
}

const failed = results.filter(r => r.status === 'error');
if (failed.length > 0) {
    failed.forEach(r => console.warn(`${r.name}.${r.extension}: ${r.message}`));
}
```

**Return type:** `AsyncResult<DeleteResult[]>`

`DeleteResult` contains:
- `name` — Object name
- `extension` — File extension
- `status` — `'success'` or `'error'`
- `message?` — Error message when status is `'error'`

When the deletion is blocked by external references, the error tuple's error is an `ExternalReferencesError` whose `references: ExternalReference[]` lists each `(object, referencedBy)` pair. Use `instanceof ExternalReferencesError` to narrow.

---

*Last updated: v0.5.13*
