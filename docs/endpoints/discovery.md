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
- [GET /packages/:name/stats](#get-packagesnamestats)
  - [Library Usage](#library-usage-5)

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
        { "name": "ZDEV", "description": "Development package" },
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
});
```

**Return Type:**
```typescript
type AsyncResult<Package[]> = Promise<[Package[], null] | [null, Error]>;

interface Package {
  name: string;
  description?: string;
}
```

**Notes:**
- Requires authentication (call `client.login()` first)
- Returns AsyncResult tuple for error handling
- Use filter parameter (`'Z*'`, `'$TMP'`, etc.) for faster queries
- Without filter, returns all packages which can be slow on large systems

---

## POST /tree

Get hierarchical tree contents for a package. Returns structured response with separate arrays for packages, folders, and objects.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| POST | `/tree` | Yes |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `package` | string | No | Package to browse. Omit to get top-level packages only. |
| `path` | string | No | Path within the package for drilling down (e.g., `CORE_DATA_SERVICES/DDLS`) |
| `owner` | string | No | Filter results by object owner/creator |

### Response

Structured tree response:

| Field | Type | Description |
|-------|------|-------------|
| `packages` | PackageNode[] | Subpackages within this package |
| `folders` | FolderNode[] | Category folders (groups, types) |
| `objects` | ObjectNode[] | SAP objects at this level |

**PackageNode:**
| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Package name (e.g., `ZBEACON_F01`) |
| `description` | string? | Package description |
| `numContents` | number | Count of items in package |

**FolderNode:**
| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Technical name (e.g., `CORE_DATA_SERVICES`) |
| `displayName` | string | Display name (e.g., `Core Data Services`) |
| `numContents` | number | Count of items in folder |

**ObjectNode:**
| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Object name (e.g., `ZSNAP_VIEW`) |
| `objectType` | string | Object type label (e.g., `View`) |
| `extension` | string | File extension (e.g., `asddls`) |
| `description` | string? | Object description text |

### Example

**Request (Top-level packages):**
```json
{}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "packages": [
            { "name": "$TMP", "description": "Local Objects", "numContents": 0 },
            { "name": "ZDEV", "description": "Development", "numContents": 0 }
        ],
        "folders": [],
        "objects": []
    }
}
```

**Request (Package contents):**
```json
{
    "package": "ZSNAP_F01"
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "packages": [
            { "name": "ZBEACON_F01", "numContents": 0 },
            { "name": "ZSNAP_F01T", "numContents": 0 }
        ],
        "folders": [
            { "name": "CORE_DATA_SERVICES", "displayName": "Core Data Services", "numContents": 132 }
        ],
        "objects": []
    }
}
```

**Request (Drill into folder):**
```json
{
    "package": "ZSNAP_F01",
    "path": "CORE_DATA_SERVICES/DDLS"
}
```

**Response (objects with descriptions):**
```json
{
    "success": true,
    "data": {
        "packages": [],
        "folders": [],
        "objects": [
            {
                "name": "ZSNAP_VIEW1",
                "objectType": "View",
                "extension": "asddls",
                "description": "SNAP View Definition"
            }
        ]
    }
}
```

**Request (Filtered by owner):**
```json
{
    "package": "$TMP",
    "owner": "EBOSCH"
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "packages": [],
        "folders": [
            { "name": "CORE_DATA_SERVICES", "displayName": "Core Data Services", "numContents": 5 }
        ],
        "objects": []
    }
}
```

### Errors

| Code | Status | Cause |
|------|--------|-------|
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `SESSION_NOT_FOUND` | 401 | Invalid session |
| `UNKNOWN_ERROR` | 500 | SAP server error |

### Use Cases

- **Package explorer** — Browse package hierarchy with subpackages
- **Object discovery** — Navigate folder structure to find objects
- **Top-level packages** — Get root packages without nested ones
- **Owner filtering** — Filter by object creator for personal views

### Library Usage

```typescript
import { createClient } from 'catalyst-relay';
import type { TreeQuery, TreeResponse } from 'catalyst-relay';

const client = createClient({ baseUrl: 'https://sap-server.com' });

// Login first
await client.login({ username: 'USER', password: 'PASS' });

// Get top-level packages only (no subpackages)
const [topLevel, err1] = await client.getTree({});
if (!err1) {
  console.log('Top-level packages:');
  topLevel.packages.forEach(pkg => console.log(`  ${pkg.name}`));
}

// Get contents of a specific package
const [result, err2] = await client.getTree({ package: 'ZSNAP_F01' });
if (!err2) {
  console.log('Subpackages:', result.packages.map(p => p.name));
  console.log('Folders:', result.folders.map(f => f.displayName));
}

// Drill into a folder path
const [objects, err3] = await client.getTree({
  package: 'ZSNAP_F01',
  path: 'CORE_DATA_SERVICES/DDLS'
});
if (!err3) {
  objects.objects.forEach(obj => {
    console.log(`${obj.name} (${obj.objectType})`);
    if (obj.description) {
      console.log(`  ${obj.description}`);
    }
  });
}

// Filter by owner
const [mine, err4] = await client.getTree({
  package: '$TMP',
  owner: 'EBOSCH'
});
if (!err4) {
  console.log('My objects:', mine.objects.map(o => o.name));
}
```

**Type Definitions:**
```typescript
interface TreeQuery {
  package?: string;  // Omit for top-level packages
  path?: string;     // Folder path (e.g., "CORE_DATA_SERVICES/DDLS")
  owner?: string;    // Filter by object owner
}

interface TreeResponse {
  packages: PackageNode[];
  folders: FolderNode[];
  objects: ObjectNode[];
}

interface PackageNode {
  name: string;
  description?: string;
  numContents: number;
}

interface FolderNode {
  name: string;
  displayName: string;
  numContents: number;
}

interface ObjectNode {
  name: string;
  objectType: string;
  extension: string;
  description?: string;
}

type AsyncResult<TreeResponse> = Promise<[TreeResponse, null] | [null, Error]>;
```

**Notes:**
- Requires authentication
- Omit `package` to get only top-level packages (unlike `getPackages()` which returns all)
- Use `path` to drill into folder hierarchy (GROUP/TYPE facets)
- Use `owner` to filter results by object creator
- At leaf level, objects include `description` with object text
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
            "owner": "DEVELOPER"
        },
        {
            "id": "DEVK900100",
            "description": "Bug fixes",
            "owner": "DEVELOPER"
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
});

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
}
```

**Notes:**
- Requires authentication
- Package name is required parameter
- Returns AsyncResult tuple

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

---

## GET /packages/:name/stats

Get stats (description and object count) for a specific package.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| GET | `/packages/:name/stats` | Yes |

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Package name (URL-encoded) |

### Response

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Package name |
| `description` | string | Package description |
| `numContents` | number | Recursive object count (includes subpackages) |

### Example

**Request:**
```bash
curl http://localhost:3000/packages/ZSNAP_F01/stats \
  -H "X-Session-ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

**Response:**
```json
{
    "success": true,
    "data": {
        "name": "ZSNAP_F01",
        "description": "SNAP Package",
        "numContents": 42
    }
}
```

### Library Usage

```typescript
import { createClient } from 'catalyst-relay';

const [client] = createClient({ ... });
await client.login();

// Single package
const [stats, err] = await client.getPackageStats('ZSNAP_F01');
if (!err) {
  console.log(`${stats.name}: ${stats.numContents} objects`);
}

// Multiple packages (batch)
const [batchStats, batchErr] = await client.getPackageStats(['ZSNAP_F01', 'ZSNAP_F02']);
if (!batchErr) {
  batchStats.forEach(s => console.log(`${s.name}: ${s.numContents}`));
}
```

**Method Signature:**
```typescript
// Single package
getPackageStats(name: string): AsyncResult<PackageStats>

// Multiple packages
getPackageStats(names: string[]): AsyncResult<PackageStats[]>
```

---

*Last updated: v0.4.5*
