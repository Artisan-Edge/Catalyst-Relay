# Discovery Endpoints

Browse SAP packages, objects, and transports.

## Sections

- [GET /object-config](#get-object-config)
- [GET /packages](#get-packages)
- [POST /tree](#post-tree)
- [GET /transports/:package](#get-transportspackage)
- [POST /transports](#post-transports)

---

## GET /object-config

List all supported SAP object types and their configuration.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| GET | `/object-config` | No |

### Request Body

None required.

### Response

Array of object configuration:

| Field | Type | Description |
|-------|------|-------------|
| `endpoint` | string | ADT endpoint path |
| `nameSpace` | string | XML namespace for creation |
| `rootName` | string | Root element name for XML |
| `type` | string | SAP ADT type identifier (e.g., `DDLS/DF`) |
| `label` | string | Human-readable label (e.g., `View`) |
| `extension` | string | File extension (e.g., `asddls`) |
| `dpEndpoint` | string? | Data preview endpoint (if supported) |
| `dpParam` | string? | Data preview parameter name |

### Example

**Request:**
```bash
curl http://localhost:3000/object-config
```

**Response:**
```json
{
    "success": true,
    "data": [
        {
            "endpoint": "ddic/ddl/sources",
            "nameSpace": "xmlns:ddl=\"http://www.sap.com/adt/ddic/ddlsources\"",
            "rootName": "ddl:ddlSource",
            "type": "DDLS/DF",
            "label": "View",
            "extension": "asddls",
            "dpEndpoint": "cds",
            "dpParam": "ddlSourceName"
        },
        {
            "endpoint": "acm/dcl/sources",
            "nameSpace": "xmlns:dcl=\"http://www.sap.com/adt/acm/dclsources\"",
            "rootName": "dcl:dclSource",
            "type": "DCLS/DL",
            "label": "Access Control",
            "extension": "asdcls"
        }
    ]
}
```

### Errors

| Code | Status | Cause |
|------|--------|-------|
| `UNKNOWN_ERROR` | 500 | Server error |

### Use Cases

- **Extension mapping** — Map file extensions to SAP types
- **Feature detection** — Check which object types support data preview
- **UI configuration** — Build object type selectors

---

## GET /packages

List all available packages in the SAP system.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| GET | `/packages` | Yes |

### Request Body

None required.

### Response

Array of package objects:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Package name (e.g., `$TMP`, `ZPACKAGE`) |
| `description` | string? | Package description |
| `parentPackage` | string? | Parent package name |

### Example

**Request:**
```bash
curl http://localhost:3000/packages \
  -H "X-Session-ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

**Response:**
```json
{
    "success": true,
    "data": [
        { "name": "$TMP", "description": "Local objects" },
        { "name": "ZDEV", "description": "Development package", "parentPackage": "ZROOT" },
        { "name": "ZPROD", "description": "Production package" }
    ]
}
```

### Errors

| Code | Status | Cause |
|------|--------|-------|
| `SESSION_NOT_FOUND` | 401 | Invalid session |
| `UNKNOWN_ERROR` | 500 | SAP server error |

### Use Cases

- **Package picker UI** — Populate dropdown for package selection
- **Discover structure** — Map package hierarchy via `parentPackage`
- **Find local objects** — `$TMP` contains temporary/local objects

---

## POST /tree

Get hierarchical tree for package browsing. Supports lazy loading of nested nodes.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| POST | `/tree` | Yes |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `package` | string | No | Package to browse (default: root) |
| `folderType` | enum | No | Folder type: `PACKAGE`, `TYPE`, `GROUP`, `API` |
| `parentPath` | string | No | Parent path for nested queries |

### Response

Array of tree nodes:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Node name |
| `type` | enum | `folder` or `object` |
| `objectType` | string? | SAP object type (for objects) |
| `extension` | string? | File extension (for objects) |
| `hasChildren` | boolean? | Whether node has children |
| `children` | array? | Nested child nodes |

### Example

**Request (Root Level):**
```json
{
    "package": "$TMP"
}
```

**Response:**
```json
{
    "success": true,
    "data": [
        {
            "name": "Source Code Library",
            "type": "folder",
            "hasChildren": true
        },
        {
            "name": "Dictionary Objects",
            "type": "folder",
            "hasChildren": true
        },
        {
            "name": "ZTEST_CLASS",
            "type": "object",
            "objectType": "CLAS",
            "extension": "clas.abap"
        }
    ]
}
```

**Request (Nested):**
```json
{
    "package": "$TMP",
    "folderType": "TYPE",
    "parentPath": "Source Code Library"
}
```

### Errors

| Code | Status | Cause |
|------|--------|-------|
| `VALIDATION_ERROR` | 400 | Invalid folderType value |
| `SESSION_NOT_FOUND` | 401 | Invalid session |
| `UNKNOWN_ERROR` | 500 | SAP server error |

### Use Cases

- **File explorer UI** — Build tree view with lazy loading
- **Object discovery** — Browse objects by type/category
- **Navigation** — Drill into package structure

---

## GET /transports/:package

List available transport requests for a package.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| GET | `/transports/:package` | Yes |

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `package` | string | Yes | Package name (URL-encoded) |

### Request Body

None required.

### Response

Array of transport objects:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Transport ID (e.g., `DEVK900123`) |
| `description` | string | Transport description |
| `owner` | string | Transport owner username |
| `status` | enum | `modifiable` or `released` |

### Example

**Request:**
```bash
curl http://localhost:3000/transports/ZDEV \
  -H "X-Session-ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

**Response:**
```json
{
    "success": true,
    "data": [
        {
            "id": "DEVK900123",
            "description": "New feature implementation",
            "owner": "DEVELOPER",
            "status": "modifiable"
        },
        {
            "id": "DEVK900100",
            "description": "Bug fixes",
            "owner": "DEVELOPER",
            "status": "released"
        }
    ]
}
```

### Errors

| Code | Status | Cause |
|------|--------|-------|
| `VALIDATION_ERROR` | 400 | Package name is required |
| `SESSION_NOT_FOUND` | 401 | Invalid session |
| `UNKNOWN_ERROR` | 500 | SAP server error |

### Use Cases

- **Transport picker** — Show available transports for upsert operations
- **Status check** — Filter by `modifiable` for active transports
- **Ownership** — Filter transports by owner

---

## POST /transports

Create a new transport request for a package.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| POST | `/transports` | Yes |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `package` | string | Yes | Package name (DEVCLASS) |
| `description` | string | Yes | Transport description/text |

### Response

| Field | Type | Description |
|-------|------|-------------|
| `transportId` | string | Created transport ID (e.g., `DEVK900456`) |

### Example

**Request:**
```bash
curl -X POST http://localhost:3000/transports \
  -H "X-Session-ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890" \
  -H "Content-Type: application/json" \
  -d '{
    "package": "ZDEV",
    "description": "New feature implementation"
  }'
```

**Response:**
```json
{
    "success": true,
    "data": {
        "transportId": "DEVK900456"
    }
}
```

### Errors

| Code | Status | Cause |
|------|--------|-------|
| `VALIDATION_ERROR` | 400 | Missing package or description |
| `SESSION_NOT_FOUND` | 401 | Invalid session |
| `UNKNOWN_ERROR` | 500 | SAP server error |

### Use Cases

- **New transport** — Create transport before upsert to non-$TMP package
- **Batch operations** — Create dedicated transport for related changes
- **Workflow automation** — Programmatically create transports
