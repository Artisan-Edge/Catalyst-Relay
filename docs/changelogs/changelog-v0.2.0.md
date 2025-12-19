# Changelog - v0.2.0

## Release Date
December 6, 2025

## Overview

Initial public release of Catalyst-Relay — a TypeScript port of SNAP-Relay-API that provides middleware for bridging frontend applications to SAP ADT (ABAP Development Tools) servers. This release marks a fundamental shift from a standalone Python server to an embeddable TypeScript library, enabling direct integration into the Catalyst-Edit VSCode extension and other TypeScript/Node.js applications.

## Breaking Changes

Not applicable — this is the initial release.

## Business Impact

### Simplified Developer Experience

Previously, developers using Catalyst-Edit (our VSCode extension for SAP development) had to run a separate Python relay server on their laptops before connecting to SAP systems. Catalyst-Relay eliminates this requirement by providing a **library-first architecture** that can be imported directly into TypeScript applications.

**Before (Python SNAP-Relay-API):**
1. Install Python and dependencies
2. Start the relay server manually
3. Configure Catalyst-Edit to connect to localhost
4. Use the extension

**After (Catalyst-Relay):**
1. Install Catalyst-Edit
2. Use the extension

### Dual-Mode Architecture

Catalyst-Relay operates in two modes to support different use cases:

**Library Mode** — For direct integration into TypeScript/Node.js applications (e.g., Catalyst-Edit):

```typescript
import { createClient } from 'catalyst-relay';

// Create client with Go-style error tuples
const [client, error] = createClient({
    url: 'https://sap-server:443',
    client: '100',
    auth: { type: 'basic', username: 'user', password: 'pass' },
    insecure: true  // For self-signed certs
});
if (error) throw error;

// Login and get session
const [session, loginError] = await client.login();
if (loginError) throw loginError;

console.log(`Logged in as ${session.username}`);

// Read ABAP objects
const [objects, readError] = await client.read([
    { name: 'ZCL_MY_CLASS', extension: 'aclass' },
    { name: 'ZTEST_PROGRAM', extension: 'asprog' },
    { name: 'ZSNAP_CDS_VIEW', extension: 'asddls' }
]);

// Upsert (create or update) a CDS view
const [results, upsertError] = await client.upsert([
    {
        name: 'ZSNAP_NEW_VIEW',
        extension: 'asddls',
        content: `@AccessControl.authorizationCheck: #NOT_REQUIRED
define view entity ZSNAP_NEW_VIEW as select from t000 {
    key mandt,
    mtext
}`
    }
], '$TMP');

// Search for objects
const [searchResults] = await client.search('ZSNAP*', ['DDLS/DF', 'CLAS/OC']);

// Logout when done
await client.logout();
```

**Server Mode** — For HTTP API access (backwards-compatible with existing integrations):

```bash
# Start the server
bun run src/server.ts

# Or with custom port
PORT=8080 bun run src/server.ts
```

Example HTTP requests:

```bash
# Login
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://sap-server:443",
    "client": "100",
    "auth": { "type": "basic", "username": "user", "password": "pass" }
  }'

# Response: { "success": true, "data": { "sessionId": "abc123", "username": "USER" } }

# Read objects (with session header)
curl -X POST http://localhost:3000/objects/read \
  -H "Content-Type: application/json" \
  -H "x-session-id: abc123" \
  -d '[{ "name": "ZCL_MY_CLASS", "extension": "aclass" }]'

# Preview table data
curl -X POST http://localhost:3000/preview/data \
  -H "Content-Type: application/json" \
  -H "x-session-id: abc123" \
  -d '{
    "objectName": "T000",
    "columns": ["MANDT", "MTEXT"],
    "limit": 10
  }'
```

### Full Test Suite

This release introduces a comprehensive test suite — a significant improvement over the Python version which lacked automated testing.

**Running Unit Tests:**

```bash
# Run all tests
bun test

# Watch mode for development
bun test --watch

# Run specific test file
bun test src/__tests__/index.test.ts
```

**Running Integration Tests:**

Integration tests connect to a live SAP system and require credentials:

```bash
# Windows
./test.bat <SAP_PASSWORD>

# The script runs unit tests first, then integration tests
# Results are saved to test.output
```

**Test Coverage:**

| Test File | Coverage |
|-----------|----------|
| `index.test.ts` | Client creation, result utilities, object config |
| `cds-workflow.test.ts` | CDS View + Access Control lifecycle |
| `abap-class-workflow.test.ts` | ABAP Class CRAUD operations |
| `abap-program-workflow.test.ts` | ABAP Program CRAUD operations |
| `table-workflow.test.ts` | Table operations + data preview |
| `discovery-workflow.test.ts` | Packages, tree browsing, transports |
| `search-workflow.test.ts` | Object search + where-used analysis |
| `data-preview-workflow.test.ts` | Table/view data preview |
| `upsert-workflow.test.ts` | Create vs update detection |

### Supported Object Types

| Extension | Object Type | ADT Type |
|-----------|-------------|----------|
| `asddls` | CDS View | DDLS/DF |
| `asdcls` | Access Control | DCLS/DL |
| `aclass` | ABAP Class | CLAS/OC |
| `asprog` | ABAP Program | PROG/P |
| `astabldt` | Table | TABL/DT |

### Feature Summary

**Session Management:**
- Login/logout with session tokens
- Automatic CSRF token handling and refresh
- Session expiration with configurable cleanup
- Support for multiple concurrent sessions

**CRAUD Operations:**
- **Create** — Create new ABAP objects in a package
- **Read** — Batch read objects with full content
- **Activate** — Compile and validate objects
- **Update** — Modify existing objects (with automatic locking)
- **Delete** — Remove objects from the system

**Discovery:**
- List available packages
- Browse package trees hierarchically
- List transports for a package
- Create new transport requests

**Data Preview:**
- Query table/view data with filtering and sorting
- Get distinct column values
- Count rows

**Search:**
- Search objects by name pattern
- Filter by object types
- Find where-used dependencies

**Diff:**
- Compare local content with server version
- Git-style unified diff output

## Technical Details

### Runtime Compatibility

Catalyst-Relay is **runtime-agnostic** — it uses only web standard APIs (`fetch`, `Request`, `Response`, `URL`) and works on both Bun and Node.js:

```bash
# Development (Bun)
bun run dev

# Verify Node.js compatibility
node --experimental-strip-types -e "import('./dist/index.js')"
```

The library requires Node.js 20+ for consumers.

### Package Exports

The package supports both ESM and CommonJS:

```typescript
// ESM
import { createClient } from 'catalyst-relay';

// CommonJS
const { createClient } = require('catalyst-relay');
```

### Dependencies

| Package | Purpose |
|---------|---------|
| `hono` | HTTP server framework (server mode) |
| `zod` | Runtime schema validation |
| `undici` | HTTP client with SSL bypass support |
| `@xmldom/xmldom` | XML parsing for ADT responses |
| `diff` | Text diffing for git-diff feature |

### Project Structure

```
src/
├── index.ts              # Library exports
├── server.ts             # Hono HTTP server
├── core/                 # Pure business logic
│   ├── client.ts         # ADT client implementation
│   ├── config.ts         # Configuration loading
│   ├── adt/              # ADT operations (one file per operation)
│   ├── auth/             # Authentication strategies
│   ├── session/          # Session management
│   └── utils/            # Shared utilities
├── types/                # TypeScript type definitions
└── server/               # Server-specific code
    ├── routes/           # HTTP route handlers
    └── middleware/       # Hono middleware
```

### Go-Style Error Handling

All async operations return `[result, error]` tuples instead of throwing exceptions:

```typescript
const [data, error] = await client.read(objects);
if (error) {
    // Handle error
    console.error(error.message);
    return;
}
// Use data safely
```

### SSL Verification Bypass

SAP systems often use self-signed certificates. The `insecure: true` option uses `undici` to bypass SSL verification:

```typescript
const [client] = createClient({
    url: 'https://sap-server:443',
    client: '100',
    auth: { type: 'basic', username: 'user', password: 'pass' },
    insecure: true  // Skip SSL verification
});
```

## Known Limitations

- **SAML authentication**: Stubbed out, not yet implemented
- **SSO (Kerberos) authentication**: Stubbed out, not yet implemented
- Basic authentication is fully functional

## API Reference

### HTTP Endpoints (Server Mode)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/login` | Authenticate and get session ID |
| DELETE | `/logout` | End session |
| GET | `/object-config` | List supported object types |
| GET | `/packages` | List available packages |
| POST | `/tree` | Browse package tree |
| GET | `/transports/:package` | List transports |
| POST | `/transports` | Create transport |
| POST | `/objects/read` | Batch read objects |
| POST | `/objects/upsert/:package/:transport?` | Create/update objects |
| POST | `/objects/activate` | Activate objects |
| DELETE | `/objects/:transport?` | Delete objects |
| POST | `/preview/data` | Query table/view data |
| POST | `/preview/distinct` | Get distinct values |
| POST | `/preview/count` | Count rows |
| POST | `/search/:query` | Search objects |
| POST | `/where-used` | Find dependencies |
| POST | `/git-diff` | Compare with server |

### Client Methods (Library Mode)

| Method | Description |
|--------|-------------|
| `login()` | Authenticate and create session |
| `logout()` | End session |
| `read(objects)` | Batch read with content |
| `create(object, package, transport?)` | Create new object |
| `update(object, transport?)` | Update existing object |
| `upsert(objects, package, transport?)` | Create or update |
| `activate(objects)` | Compile and validate |
| `delete(objects, transport?)` | Remove objects |
| `getPackages()` | List packages |
| `getTree(query)` | Browse package tree |
| `getTransports(package)` | List transports |
| `createTransport(config)` | Create transport |
| `previewData(query)` | Query table/view |
| `getDistinctValues(object, column)` | Distinct values |
| `countRows(object, type)` | Row count |
| `search(query, types?)` | Search objects |
| `whereUsed(object)` | Find dependencies |
| `gitDiff(objects)` | Compare with server |
| `getObjectConfig()` | Supported object types |

## Commits Included

- 838acde - [VERSION] v0.2.0
- f3d8e88 - [UPDATE] Improving logging
- 89ea659 - [UPDATE] Undici for bypassing SSL verification
- 2cb3c9a - [UPDATE] Suspicious about these changes
- 1a6d8e4 - [UPDATE] Becoming installable
- 20947fa - [UPDATE] Avoiding closures for the sake of memory
- a7049ac - [UPDATE] Missing routes
- abd65e5 - [UPDATE] Documentation cleanup
- bc9ed09 - [UPDATE] Improving type locations
- a620a10 - [UPDATE] Documentation
- 6c477f2 - [UPDATE] Documentation update
- d434b39 - [UPDATE] Deleting temp files
- 37fd57f - [UPDATE] All tests pass!!!
- 0b945f8 - [UPDATE]
- a197c5e - [UPDATE] Setting up the test suite
- 5f75914 - [UPDATE] Making a bunch more tests
- bb00377 - [UPDATE] Tweaks
- 3485c7d - [UPDATE] First set of tests work!
- 896a569 - [UPDATE] Starting on the test suite
- 3233ea8 - [UPDATE] Better commenting
- 586b8ec - [UPDATE] Better comments
- 5dd230c - [UPDATE] Splitting code apart
- 2bcc942 - [UPDATE] Cleaning up the routes
- a155777 - [UPDATE] Cleaning some things up, hopefully
- 36a99da - [UPDATE] Claude update
- c523530 - [UPDATE] New checkpoint
- 940a35c - [UPDATE] Initial pass
- c13b182 - [UPDATE] Project structure
- d2c18c8 - [INIT]

---

**Author**: Egan Bosch
**Maintained By**: Claude (AI Documentation Assistant)
