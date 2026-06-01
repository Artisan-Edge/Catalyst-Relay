# Catalyst-Relay

[![npm version](https://img.shields.io/npm/v/catalyst-relay.svg)](https://www.npmjs.com/package/catalyst-relay)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)

TypeScript middleware for bridging frontend applications to SAP ADT (ABAP Development Tools) servers.

## Overview

Catalyst-Relay provides a clean, type-safe interface for interacting with SAP ADT services. It enables CRAUD operations (Create, Read, Activate, Update, Delete) on ABAP objects, package discovery, data preview, and search capabilities.

### Dual-Mode Architecture

This package operates in two modes:

**Library Mode** — Import functions directly into your TypeScript/Node.js application:

```typescript
import { createClient } from 'catalyst-relay';
```

**Server Mode** — Run as an HTTP API server:

```bash
bun run src/server.ts
```

## Installation

```bash
npm install catalyst-relay
```

Or with Bun:

```bash
bun add catalyst-relay
```

## Quick Start

### Library Mode

```typescript
import { createClient } from 'catalyst-relay';

// Create client
const [client, error] = createClient({
    url: 'https://sap-server:443',
    client: '100',
    auth: { type: 'basic', username: 'user', password: 'pass' },
    insecure: true  // For self-signed certificates
});
if (error) throw error;

// Login
const [session, loginError] = await client.login();
if (loginError) throw loginError;
console.log(`Logged in as ${session.username}`);

// --- SAML Authentication (requires playwright) ---
const [samlClient] = createClient({
    url: 'https://sap-server:443',
    client: '100',
    auth: {
        type: 'saml',
        username: 'user@company.com',
        password: 'pass',
        sapUser: 'SAPUSER01'  // Required: SAP username for object attribution
    },
    insecure: true
});

// --- SSO Authentication (requires kerberos) ---
const [ssoClient] = createClient({
    url: 'https://sap-server:443',
    client: '100',
    auth: {
        type: 'sso',
        slsUrl: 'https://sapsso.company.com'
    },
    insecure: true
});

// Read ABAP objects
const [objects, readError] = await client.read([
    { name: 'ZCL_MY_CLASS', extension: 'aclass' },
    { name: 'ZTEST_PROGRAM', extension: 'asprog' }
]);

// Logout when done
await client.logout();
```

### Server Mode

Start the server:

```bash
# Default port 3000
bun run src/server.ts

# Custom port
PORT=8080 bun run src/server.ts
```

Make requests:

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

# Login with SAML
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://sap-server:443",
    "client": "100",
    "auth": { "type": "saml", "username": "user@company.com", "password": "pass", "sapUser": "SAPUSER01" }
  }'

# Login with SSO (Kerberos)
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://sap-server:443",
    "client": "100",
    "auth": { "type": "sso", "slsUrl": "https://sapsso.company.com" }
  }'
```

## Features

### Authentication
- **Basic Auth** — Username/password authentication
- **SAML** — Browser-automated SSO via identity providers (Azure AD, Okta, SAP IDP)
- **SSO (Kerberos)** — Windows domain authentication via SAP Secure Login Server

### Session Management
- Login/logout with session tokens
- Automatic CSRF token handling and refresh
- Session expiration with configurable cleanup
- Automatic session refresh (keepalive) during long operations
- Manual session refresh via `refreshSession()`
- Support for multiple concurrent sessions

### CRAUD Operations
- **Create** — Create new ABAP objects in a package
- **Read** — Batch read objects with full content
- **Activate** — Compile and validate objects
- **Update** — Modify existing objects (with automatic locking)
- **Delete** — Remove objects from the system

### Discovery
- List available packages
- Browse package trees hierarchically
- List transports for a package
- Create new transport requests

### Data Preview
- Query table/view data with filtering and sorting
- Get distinct column values
- Count rows
- Run freestyle OpenSQL queries with per-request row limits and timeouts

### Search
- Search objects by name pattern
- Filter by object types
- Find where-used dependencies

### Diff
- Compare local content with server version
- Git-style unified diff output

## Supported Object Types

| Extension | Object Type | ADT Type |
|-----------|-------------|----------|
| `asddls` | CDS View | DDLS/DF |
| `asdcls` | Access Control | DCLS/DL |
| `aclass` | ABAP Class | CLAS/OC |
| `asprog` | ABAP Program | PROG/P |
| `asinc` | ABAP Include | PROG/I |
| `astabldt` | Table | TABL/DT |
| `astablds` | Structure | STRU/D |

## Library Mode API Reference

### Client Methods

| Method | Description |
|--------|-------------|
| `login()` | Authenticate and create session |
| `logout()` | End session |
| `refreshSession()` | Manually refresh session (keepalive) |
| `exportSessionState()` | Serialize session for transfer to another process |
| `importSessionState(state)` | Restore a previously exported session |
| `read(objects)` | Batch read with content |
| `create(object, package, transport?)` | Create a new object |
| `update(object, transport?)` | Update an existing object |
| `upsert(objects, package, transport?)` | Create or update a batch |
| `activate(objects)` | Run-based activation; mixed extensions allowed |
| `checkSyntax(objects)` | Syntax check (single extension per batch) |
| `delete(objects, transport?)` | Multi-delete with dependency ordering; returns `DeleteResult[]` |
| `getPackages(options?)` | List packages (filter, includeDescriptions) |
| `getPackageStats(nameOrNames)` | Package description and recursive object count |
| `getTree(query)` | Browse package tree (supports owner filter) |
| `getTransports(package)` | List transports |
| `createTransport(config)` | Create transport |
| `deleteTransport(id, removeObjects?)` | Delete transport (optionally clear contents first) |
| `removeFromTransport(id, objectName)` | Remove a single object from a transport |
| `viewTransportObjects(id)` | List tasks and objects on a transport |
| `getInactiveObjects()` | List objects/transports awaiting activation |
| `previewData(query)` | Query table/view |
| `getDistinctValues(name, parameters, column, type?)` | Distinct values with counts |
| `countRows(name, type, parameters?)` | Row count |
| `freestyleQuery(sqlQuery, limit?, timeout?)` | Run arbitrary read-only OpenSQL; optional row limit and per-request timeout (ms) |
| `search(query, options?)` | Search objects (`{ types?, includePackages? }`) |
| `whereUsed(object)` | Find dependencies |
| `gitDiff(objects)` | Compare with server |
| `getObjectConfig()` | Supported object types |

### Usage Examples

#### Reading Objects

```typescript
const [objects, error] = await client.read([
    { name: 'ZCL_MY_CLASS', extension: 'aclass' },
    { name: 'ZSNAP_CDS_VIEW', extension: 'asddls' }
]);

if (error) {
    console.error('Read failed:', error.message);
    return;
}

for (const obj of objects) {
    console.log(`${obj.name}: ${obj.content.length} bytes`);
}
```

#### Creating/Updating Objects (Upsert)

```typescript
const [results, error] = await client.upsert([
    {
        name: 'ZSNAP_NEW_VIEW',
        extension: 'asddls',
        content: `@AccessControl.authorizationCheck: #NOT_REQUIRED
define view entity ZSNAP_NEW_VIEW as select from t000 {
    key mandt,
    mtext
}`
    }
], '$TMP');  // Package name

if (error) {
    console.error('Upsert failed:', error.message);
}
```

#### Searching Objects

```typescript
const [results, error] = await client.search('ZSNAP*', { types: ['DDLS', 'CLAS'] });

if (!error) {
    for (const result of results) {
        console.log(`${result.name} (${result.objectType})`);
    }
}
```

#### Previewing Table Data

```typescript
const [data, error] = await client.previewData({
    objectName: 'T000',
    objectType: 'table',
    sqlQuery: "SELECT MANDT, MTEXT FROM T000 WHERE MANDT = '100'",
    limit: 10
});
```

#### Freestyle OpenSQL Query

For cases where the structured preview isn't enough, run an arbitrary read-only `SELECT`. This is a power-user surface — the query is not parsed or restricted beyond an optional row `limit` (max 50,000) and per-request `timeout` in milliseconds (max 5 minutes), so callers are responsible for deciding who may issue arbitrary SQL.

```typescript
const [data, error] = await client.freestyleQuery(
    "SELECT carrid, connid, fldate FROM sflight WHERE carrid = 'LH'",
    500,    // optional row limit (default 100)
    60000   // optional per-request timeout in ms
);
```

## Server Mode API Reference

### HTTP Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/login` | Authenticate and get session ID |
| DELETE | `/logout` | End session |
| POST | `/session/refresh` | Refresh session (keepalive) |
| GET | `/object-config` | List supported object types |
| GET | `/packages` | List available packages |
| GET | `/packages/:name/stats` | Get package metadata and count |
| POST | `/tree` | Browse package tree (supports owner filter) |
| GET | `/transports/:package` | List transports for a package |
| POST | `/transports` | Create transport |
| DELETE | `/transports/:transportId` | Delete a transport (`?removeObjects=true` to clear first) |
| GET | `/transports/:transportId/objects` | List tasks/objects on a transport |
| PUT | `/transports/:transportId/objects` | Remove a single object from a transport |
| GET | `/inactive-objects` | List objects/transports awaiting activation |
| POST | `/objects/read` | Batch read objects |
| POST | `/objects/upsert/:package/:transport?` | Create/update objects |
| POST | `/objects/activate` | Activate objects |
| POST | `/objects/check` | Syntax check objects |
| DELETE | `/objects/:transport?` | Multi-delete with dependency ordering |
| POST | `/preview/data` | Query table/view data |
| POST | `/preview/distinct` | Get distinct values |
| POST | `/preview/count` | Count rows |
| POST | `/preview/freestyle` | Run arbitrary read-only OpenSQL |
| POST | `/search/:query` | Search objects |
| POST | `/where-used` | Find dependencies |
| POST | `/git-diff` | Compare with server |

### Authentication

All endpoints except `/login` require a session header:

```
x-session-id: <session-id-from-login>
```

### Example Requests

#### Read Objects

```bash
curl -X POST http://localhost:3000/objects/read \
  -H "Content-Type: application/json" \
  -H "x-session-id: abc123" \
  -d '[{ "name": "ZCL_MY_CLASS", "extension": "aclass" }]'
```

#### Preview Table Data

```bash
curl -X POST http://localhost:3000/preview/data \
  -H "Content-Type: application/json" \
  -H "x-session-id: abc123" \
  -d '{
    "objectName": "T000",
    "objectType": "table",
    "sqlQuery": "SELECT MANDT, MTEXT FROM T000 WHERE MANDT = '\''100'\''",
    "limit": 10
  }'
```

#### Freestyle OpenSQL Query

```bash
curl -X POST http://localhost:3000/preview/freestyle \
  -H "Content-Type: application/json" \
  -H "x-session-id: abc123" \
  -d '{
    "sqlQuery": "SELECT carrid, connid, fldate FROM sflight WHERE carrid = '\''LH'\''",
    "limit": 500,
    "timeout": 60000
  }'
```

#### Search Objects

```bash
curl -X POST "http://localhost:3000/search/ZSNAP*" \
  -H "Content-Type: application/json" \
  -H "x-session-id: abc123" \
  -d '["DDLS", "CLAS"]'
```

## Error Handling

Catalyst-Relay uses Go-style result tuples instead of throwing exceptions:

```typescript
const [data, error] = await client.read(objects);

if (error) {
    // Handle error
    console.error(error.message);
    return;
}

// Use data safely
console.log(data);
```

Every async operation returns `[result, null]` on success or `[null, error]` on failure.

## SSL/TLS Configuration

SAP systems often use self-signed certificates. Use the `insecure` option to bypass SSL verification:

```typescript
const [client] = createClient({
    url: 'https://sap-server:443',
    client: '100',
    auth: { type: 'basic', username: 'user', password: 'pass' },
    insecure: true  // Skip SSL verification
});
```

This uses `undici` under the hood for HTTP requests with SSL bypass support.

## Testing

### Unit Tests

```bash
# Run all tests
bun test

# Watch mode
bun test --watch

# Specific test file
bun test src/__tests__/index.test.ts
```

### Integration Tests

Integration tests connect to a live SAP system and require credentials:

```bash
# Windows
./test.bat <SAP_PASSWORD>
```

### Test Coverage

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

## Requirements

- **Node.js**: 20.0.0 or higher
- **Runtime**: Works on both Bun (development) and Node.js (library consumers)

The library uses only web standard APIs (`fetch`, `Request`, `Response`, `URL`) for cross-platform compatibility.

## Known Limitations

- **SSO (Kerberos)**: Primarily tested on Windows with Active Directory; Linux/macOS requires MIT Kerberos with valid ticket (`kinit`)
- **SAML**: First run downloads Chromium browser (~150MB) for headless automation

## Dependencies

| Package | Purpose |
|---------|---------|
| `hono` | HTTP server framework (server mode) |
| `zod` | Runtime schema validation |
| `undici` | HTTP client with SSL bypass support |
| `@xmldom/xmldom` | XML parsing for ADT responses |
| `diff` | Text diffing for git-diff feature |
| `node-forge` | Certificate parsing and RSA key generation (SSO) |

### Optional Peer Dependencies

| Package | Required For | Install |
|---------|--------------|---------|
| `playwright` | SAML authentication | `npm install playwright` |
| `kerberos` | SSO (Kerberos) authentication | `npm install kerberos` |

## Project Structure

```
src/
├── index.ts              # Library exports
├── server.ts             # Hono HTTP server
├── core/                 # Pure business logic
│   ├── client.ts         # ADT client implementation
│   ├── config.ts         # Configuration loading
│   ├── adt/              # ADT operations
│   ├── auth/             # Authentication strategies
│   │   ├── basic/        # Username/password auth
│   │   ├── saml/         # SAML browser automation
│   │   └── sso/          # Kerberos + mTLS certificates
│   ├── session/          # Session management
│   └── utils/            # Shared utilities
├── types/                # TypeScript type definitions
└── server/               # Server-specific code
    ├── routes/           # HTTP route handlers
    └── middleware/       # Hono middleware
```

## License

MIT

## Author

Egan Bosch

---

*Last updated: v0.5.14*
