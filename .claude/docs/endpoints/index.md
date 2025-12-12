# Endpoint Documentation

Comprehensive documentation for all Catalyst-Relay HTTP endpoints.

## Sections

- [Categories](#categories)
- [Library Mode](#library-mode)
- [Common Headers](#common-headers)
- [Response Format](#response-format)
- [Error Codes](#error-codes)

---

## Categories

| Category | Description |
|----------|-------------|
| [Authentication](./auth.md) | Session management (`/login`, `/logout`) |
| [Discovery](./discovery.md) | Browse SAP metadata (`/object-config`, `/packages`, `/tree`, `/transports`) |
| [Objects](./objects.md) | CRAUD operations (`/objects/*`) |
| [Preview](./preview.md) | Data preview (`/preview/*`) |
| [Search](./search.md) | Object search (`/search`, `/where-used`) |
| [Diff](./diff.md) | Content comparison (`/git-diff`) |

---

## Library Mode

Catalyst-Relay can be used directly as a TypeScript library without running the HTTP server. Each endpoint documentation page includes "Library Usage" sections showing the equivalent ADTClient methods.

### Quick Start

```typescript
import { createClient } from 'catalyst-relay';
import type { ClientConfig } from 'catalyst-relay';

// Configure the client
const config: ClientConfig = {
    url: 'https://sap-dev.example.com:443',
    client: '100',
    auth: {
        type: 'basic',
        username: 'DEVELOPER',
        password: 'secret123'
    }
};

// Create client (synchronous)
const [client, createErr] = createClient(config);
if (createErr) {
    console.error('Failed to create client:', createErr.message);
    process.exit(1);
}

// Login (async)
const [session, loginErr] = await client.login();
if (loginErr) {
    console.error('Login failed:', loginErr.message);
    process.exit(1);
}
console.log(`Logged in as ${session.username}`);

// Use client methods...
const [packages, err] = await client.getPackages();

// Logout when done
await client.logout();
```

### Error Handling

The library uses Go-style error tuples for all operations:

```typescript
type Result<T, E = Error> = [T, null] | [null, E];
type AsyncResult<T, E = Error> = Promise<Result<T, E>>;
```

Always check for errors before using the result:

```typescript
const [data, err] = await client.someMethod();
if (err) {
    console.error('Operation failed:', err.message);
    return;
}
// data is guaranteed non-null here
```

### ADTClient Methods

| HTTP Endpoint | Library Method |
|--------------|----------------|
| `POST /login` | `client.login()` |
| `DELETE /logout` | `client.logout()` |
| `GET /object-config` | `client.getObjectConfig()` |
| `GET /packages` | `client.getPackages()` |
| `POST /tree` | `client.getTree(query)` |
| `GET /transports/:pkg` | `client.getTransports(packageName)` |
| `POST /transports` | `client.createTransport(config)` |
| `POST /objects/read` | `client.read(objects)` |
| `POST /objects/upsert/...` | `client.upsert(objects, pkg, transport?)` |
| `POST /objects/activate` | `client.activate(objects)` |
| `DELETE /objects/...` | `client.delete(objects, transport?)` |
| `POST /preview/data` | `client.previewData(query)` |
| `POST /preview/distinct` | `client.getDistinctValues(...)` |
| `POST /preview/count` | `client.countRows(name, type)` |
| `POST /search/:query` | `client.search(query, types?)` |
| `POST /where-used` | `client.whereUsed(object)` |
| `POST /git-diff` | `client.gitDiff(objects)` |

See individual endpoint documentation for detailed type signatures and examples.

---

## Common Headers

All authenticated endpoints require the `X-Session-ID` header:

| Header | Required | Description |
|--------|----------|-------------|
| `X-Session-ID` | Yes* | Session ID from `/login` response |
| `Content-Type` | Yes | `application/json` for POST/DELETE with body |

*Not required for `POST /login`

---

## Response Format

All endpoints return a consistent envelope:

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | `true` for success, `false` for error |
| `data` | varies | Response payload (on success) |
| `error` | string | Error message (on failure) |
| `code` | string | Machine-readable error code (on failure) |

---

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `AUTH_FAILED` | 401 | Invalid credentials or session |
| `SESSION_EXPIRED` | 401 | Session has timed out |
| `SESSION_NOT_FOUND` | 401 | Invalid session ID |
| `CSRF_INVALID` | 403 | CSRF token validation failed |
| `OBJECT_LOCKED` | 409 | Object locked by another user |
| `OBJECT_NOT_FOUND` | 404 | Object does not exist |
| `TRANSPORT_REQUIRED` | 400 | Transport needed for non-$TMP package |
| `ACTIVATION_FAILED` | 500 | Object activation error |
| `VALIDATION_ERROR` | 400 | Invalid request format |
| `NETWORK_ERROR` | 502 | SAP server unreachable |
| `UNKNOWN_ERROR` | 500 | Unexpected server error |
