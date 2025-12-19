# Discovery Endpoints

Browse SAP packages, objects, and transports.

## Sections

- [GET /object-config](#get-object-config)
  - [Library Usage](#library-usage)
- [GET /packages](#get-packages)
  - [Library Usage](#library-usage-1)
- [POST /tree](#post-tree)
  - [Library Usage](#library-usage-2)
- [GET /transports/:package](#get-transportspackage)
  - [Library Usage](#library-usage-3)
- [POST /transports](#post-transports)
  - [Library Usage](#library-usage-4)

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

### Library Usage

```typescript
import { createClient } from 'catalyst-relay';

const client = createClient({ baseUrl: 'https://sap-server.com' });

// Synchronous method - returns ObjectConfig[] directly
const configs = client.getObjectConfig();

// Access configuration properties
configs.forEach(config => {
  console.log(`${config.label} (${config.extension})`);
  console.log(`  Type: ${config.type}`);
  console.log(`  Endpoint: ${config.endpoint}`);
  if (config.dpEndpoint) {
    console.log(`  Data Preview: ${config.dpEndpoint}`);
  }
});

// Find config by extension
const viewConfig = configs.find(c => c.extension === 'asddls');
```

**Return Type:**
```typescript
interface ObjectConfig {
  endpoint: string;
  nameSpace: string;
  rootName: string;
  type: string;
  label: string;
  extension: string;
  dpEndpoint?: string;
  dpParam?: string;
}
```

**Notes:**
- No authentication required
- Synchronous method (no async/await or Result tuple)
- Returns configuration array directly

---

## GET /packages

List available packages in the SAP system, optionally filtered by name pattern.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| GET | `/packages` | Yes |

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `filter` | string | No | `*` | Package name pattern (e.g., `Z*`, `$TMP`, `ZSNAP*`) |

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

**Request (all packages - slow):**
```bash
curl http://localhost:3000/packages \
  -H "X-Session-ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

**Request (filtered - fast):**
```bash
curl "http://localhost:3000/packages?filter=Z*" \
  -H "X-Session-ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

**Response:**
```json
{
    "success": true,
    "data": [
        { "name": "ZDEV", "description": "Development package", "parentPackage": "ZROOT" },
        { "name": "ZPROD", "description": "Production package" },
        { "name": "ZSNAP", "description": "SNAP objects" }
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

### Library Usage

```typescript
import { createClient } from 'catalyst-relay';
import type { Package } from 'catalyst-relay';

const client = createClient({ baseUrl: 'https://sap-server.com' });

// Login first
await client.login({ username: 'USER', password: 'PASS' });

// Get all packages (slow - returns hundreds of packages)
const [allPackages, err1] = await client.getPackages();

// Get filtered packages (fast - recommended)
const [customPackages, err2] = await client.getPackages('Z*');      // Custom packages
const [localPackages, err3] = await client.getPackages('$TMP');     // Local only
const [snapPackages, err4] = await client.getPackages('ZSNAP*');    // Specific prefix

if (err2) {
  console.error('Failed to fetch packages:', err2.message);
  return;
}

// Process packages
customPackages.forEach(pkg => {
  console.log(`${pkg.name}: ${pkg.description || 'No description'}`);
  if (pkg.parentPackage) {
    console.log(`  Parent: ${pkg.parentPackage}`);
  }
});
```

**Return Type:**
```typescript
type AsyncResult<Package[]> = Promise<[Package[], null] | [null, Error]>;

interface Package {
  name: string;
  description?: string;
  parentPackage?: string;
}
```

**Notes:**
- Requires authentication (call `client.login()` first)
- Returns AsyncResult tuple for error handling
- Use filter parameter (`'Z*'`, `'$TMP'`, etc.) for faster queries
- Without filter, returns all packages which can be slow on large systems

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

### Library Usage

```typescript
import { createClient } from 'catalyst-relay';
import type { TreeQuery, TreeNode } from 'catalyst-relay';

const client = createClient({ baseUrl: 'https://sap-server.com' });

// Login first
await client.login({ username: 'USER', password: 'PASS' });

// Get root level tree for a package
const query: TreeQuery = {
  package: '$TMP'
};

const [nodes, err] = await client.getTree(query);

if (err) {
  console.error('Failed to fetch tree:', err.message);
  return;
}

// Process tree nodes
nodes.forEach(node => {
  if (node.type === 'folder') {
    console.log(`📁 ${node.name}`);
    if (node.hasChildren) {
      console.log('  (has children - lazy load)');
    }
  } else {
    console.log(`📄 ${node.name} (${node.objectType})`);
  }
});

// Get nested tree (lazy loading)
const nestedQuery: TreeQuery = {
  package: '$TMP',
  folderType: 'TYPE',
  parentPath: 'Source Code Library'
};

const [nestedNodes, nestedErr] = await client.getTree(nestedQuery);
```

**Type Definitions:**
```typescript
interface TreeQuery {
  package?: string;
  folderType?: 'PACKAGE' | 'TYPE' | 'GROUP' | 'API';
  parentPath?: string;
}

interface TreeNode {
  name: string;
  type: 'folder' | 'object';
  objectType?: string;
  extension?: string;
  hasChildren?: boolean;
  children?: TreeNode[];
}

type AsyncResult<TreeNode[]> = Promise<[TreeNode[], null] | [null, Error]>;
```

**Notes:**
- Requires authentication
- Use `folderType` and `parentPath` for nested queries
- Check `hasChildren` to implement lazy loading
- Returns AsyncResult tuple

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

### Library Usage

```typescript
import { createClient } from 'catalyst-relay';
import type { Transport } from 'catalyst-relay';

const client = createClient({ baseUrl: 'https://sap-server.com' });

// Login first
await client.login({ username: 'USER', password: 'PASS' });

// Get transports for a package
const [transports, err] = await client.getTransports('ZDEV');

if (err) {
  console.error('Failed to fetch transports:', err.message);
  return;
}

// Process transports
transports.forEach(transport => {
  console.log(`${transport.id}: ${transport.description}`);
  console.log(`  Owner: ${transport.owner}`);
  console.log(`  Status: ${transport.status}`);
});

// Filter for modifiable transports only
const modifiableTransports = transports.filter(t => t.status === 'modifiable');

// Find transport by owner
const myTransports = transports.filter(t => t.owner === 'DEVELOPER');
```

**Return Type:**
```typescript
type AsyncResult<Transport[]> = Promise<[Transport[], null] | [null, Error]>;

interface Transport {
  id: string;
  description: string;
  owner: string;
  status: 'modifiable' | 'released';
}
```

**Notes:**
- Requires authentication
- Package name is required parameter
- Returns AsyncResult tuple
- Filter by `status === 'modifiable'` to find active transports

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

### Library Usage

```typescript
import { createClient } from 'catalyst-relay';
import type { TransportConfig } from 'catalyst-relay';

const client = createClient({ baseUrl: 'https://sap-server.com' });

// Login first
await client.login({ username: 'USER', password: 'PASS' });

// Create a new transport
const config: TransportConfig = {
  package: 'ZDEV',
  description: 'New feature implementation'
};

const [transportId, err] = await client.createTransport(config);

if (err) {
  console.error('Failed to create transport:', err.message);
  return;
}

console.log(`Created transport: ${transportId}`);

// Use the transport in subsequent operations
// For example, with upsertObject:
const [result, upsertErr] = await client.upsertObject({
  package: 'ZDEV',
  transport: transportId,
  objectType: 'DDLS/DF',
  objectName: 'ZNEW_VIEW',
  content: '...'
});
```

**Type Definitions:**
```typescript
interface TransportConfig {
  package: string;
  description: string;
}

type AsyncResult<string> = Promise<[string, null] | [null, Error]>;
```

**Notes:**
- Requires authentication
- Returns transport ID as string on success
- Returns AsyncResult tuple
- Use returned transport ID for subsequent upsert/delete operations
- Required when working with packages other than `$TMP`
