# Authentication Endpoints

Session-based authentication for SAP ADT access.

## Sections

- [POST /login](#post-login)
  - [Library Usage](#library-usage)
- [DELETE /logout](#delete-logout)
  - [Library Usage](#library-usage-1)
- [POST /session/refresh](#post-sessionrefresh)
  - [Library Usage](#library-usage-2)
- [Authentication Types](#authentication-types)

---

## POST /login

Authenticate with an SAP system and create a session. Returns a session ID for use in subsequent requests.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| POST | `/login` | No |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | SAP ADT server URL (e.g., `https://server:443`) |
| `client` | string | Yes | SAP client number, 1-3 chars (e.g., `100`) |
| `auth` | object | Yes | Authentication configuration (see [Authentication Types](#authentication-types)) |
| `timeout` | number | No | Request timeout in ms (default: 30000) |
| `insecure` | boolean | No | Skip SSL verification (dev only) |

### Response

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | string | UUID for `X-Session-ID` header |
| `username` | string | Authenticated SAP username |
| `expiresAt` | number | Session expiration (Unix ms) |

### Example

**Request (Basic Auth):**
```json
{
    "url": "https://sap-dev.example.com:443",
    "client": "100",
    "auth": {
        "type": "basic",
        "username": "DEVELOPER",
        "password": "secret123"
    }
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "username": "DEVELOPER",
        "expiresAt": 1701280800000
    }
}
```

### Errors

| Code | Status | Cause |
|------|--------|-------|
| `VALIDATION_ERROR` | 400 | Invalid request body or missing fields |
| `AUTH_FAILED` | 401 | Invalid credentials or server rejected |

### Use Cases

- **Development setup** — Connect with `insecure: true` for self-signed certs
- **Multi-client access** — Same URL, different client numbers (100, 200)
- **Session reuse** — Identical config returns existing session

### Library Usage

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
    },
    timeout: 30000,      // Optional: request timeout in ms
    insecure: true       // Optional: skip SSL verification (dev only)
};

// Create client (synchronous, returns Result tuple)
const [client, createErr] = createClient(config);
if (createErr) {
    console.error('Failed to create client:', createErr.message);
    return;
}

// Login (async, returns AsyncResult<Session>)
const [session, loginErr] = await client.login();
if (loginErr) {
    console.error('Login failed:', loginErr.message);
    return;
}

console.log('Logged in as:', session.username);
console.log('Session expires:', new Date(session.expiresAt));
```

**Error handling:**
The library uses Go-style error tuples. Always check for errors:
```typescript
if (loginErr) {
    console.error('Login failed:', loginErr.message);
    return;
}
```

**SAML example:**
```typescript
const config: ClientConfig = {
    url: 'https://sap-dev.example.com:443',
    client: '100',
    auth: {
        type: 'saml',
        username: 'user@example.com',
        password: 'secret123',
        providerConfig: {  // Optional: custom form selectors
            ignoreHttpsErrors: true,
            formSelectors: {
                username: '#j_username',
                password: '#j_password',
                submit: '#logOnFormSubmit'
            }
        }
    }
};

const [client, createErr] = createClient(config);
const [session, loginErr] = await client.login();
```

**SSO example:**
```typescript
const config: ClientConfig = {
    url: 'https://sap-dev.example.com:443',
    client: '100',
    auth: {
        type: 'sso',
        slsUrl: 'https://sapsso.corp.example.com',
        profile: 'SAPSSO_P',           // Optional
        forceEnroll: false              // Optional
    },
    insecure: true  // Typically required for corporate CAs
};

const [client, createErr] = createClient(config);
const [session, loginErr] = await client.login();
```

---

## DELETE /logout

End an active session and release SAP resources.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| DELETE | `/logout` | Yes |

### Request Body

None required.

### Response

| Field | Type | Description |
|-------|------|-------------|
| `data` | null | Always null on success |

### Example

**Request:**
```bash
curl -X DELETE http://localhost:3000/logout \
  -H "X-Session-ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890"
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
| `SESSION_NOT_FOUND` | 401 | Invalid or expired session ID |

### Use Cases

- **Clean termination** — Release SAP connections when done
- **Error recovery** — Logout and re-login to clear stale state
- **Script cleanup** — Call in finally blocks; continues even if SAP logout fails

### Library Usage

```typescript
import { createClient } from 'catalyst-relay';
import type { ClientConfig } from 'catalyst-relay';

// Assume client is already created and logged in
const config: ClientConfig = {
    url: 'https://sap-dev.example.com:443',
    client: '100',
    auth: {
        type: 'basic',
        username: 'DEVELOPER',
        password: 'secret123'
    }
};

const [client, createErr] = createClient(config);
if (createErr) {
    console.error('Failed to create client:', createErr.message);
    return;
}

const [session, loginErr] = await client.login();
if (loginErr) {
    console.error('Login failed:', loginErr.message);
    return;
}

// ... perform operations ...

// Logout (async, returns AsyncResult<void>)
const [, logoutErr] = await client.logout();
if (logoutErr) {
    console.error('Logout failed:', logoutErr.message);
    // Note: logout errors are often non-fatal
}

console.log('Successfully logged out');
```

**Error handling:**
The library uses Go-style error tuples. Always check for errors:
```typescript
if (logoutErr) {
    console.error('Logout failed:', logoutErr.message);
    return;
}
```

**Script cleanup pattern:**
```typescript
const [client, createErr] = createClient(config);
const [session, loginErr] = await client.login();

try {
    // Perform operations
    const [packages, err] = await client.getPackages();
    // ... more operations ...
} finally {
    // Always logout, even if operations fail
    await client.logout();
}
```

**Error recovery pattern:**
```typescript
// If something goes wrong, logout and re-login
const [, operationErr] = await client.someOperation();
if (operationErr) {
    console.error('Operation failed, attempting recovery');
    await client.logout();
    const [session, loginErr] = await client.login();
    // Retry operation
}
```

---

## POST /session/refresh

Refresh an active session to prevent timeout during long-running operations.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| POST | `/session/refresh` | Yes |

### Request Body

None required.

### Response

| Field | Type | Description |
|-------|------|-------------|
| `ticket` | string | Base64-encoded reentrance ticket |
| `expiresAt` | number | Session expiration (Unix ms) |

### Example

**Request:**
```bash
curl -X POST http://localhost:3000/session/refresh \
  -H "X-Session-ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

**Response:**
```json
{
    "success": true,
    "data": {
        "ticket": "dGlja2V0LWRhdGE...",
        "expiresAt": 1736717400000
    }
}
```

### Errors

| Code | Status | Cause |
|------|--------|-------|
| `SESSION_NOT_FOUND` | 401 | Invalid or expired session ID |

### Use Cases

- **Long-running operations** — Keep session alive during batch processing
- **Prevent timeout** — Extend session before it expires
- **Background workers** — Maintain session in scheduled jobs

### Library Usage

```typescript
import { createClient } from 'catalyst-relay';

// Client with auto-refresh enabled (default)
const [client, err] = createClient({
    url: 'https://sap-server:443',
    client: '100',
    auth: { type: 'basic', username: 'user', password: 'pass' },
    autoRefresh: { enabled: true, intervalMs: 30 * 60 * 1000 }  // 30 min
});

// Or disable auto-refresh
const [client2, err2] = createClient({
    url: 'https://sap-server:443',
    client: '100',
    auth: { type: 'basic', username: 'user', password: 'pass' },
    autoRefresh: { enabled: false }
});

// Manual refresh
const [result, refreshErr] = await client.refreshSession();
if (refreshErr) {
    console.error('Refresh failed:', refreshErr.message);
    return;
}

console.log('Session expires at:', new Date(result.expiresAt));
```

---

## Authentication Types

Three authentication methods are supported:

### Basic Auth

Standard SAP username/password authentication.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"basic"` | Yes | Auth type discriminator |
| `username` | string | Yes | SAP username |
| `password` | string | Yes | SAP password |

**Example:**
```json
{
    "type": "basic",
    "username": "DEVELOPER",
    "password": "secret123"
}
```

**Session timeout:** 3 hours

---

### SAML Auth

SAML-based SSO using browser automation. Requires Playwright to be installed.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"saml"` | Yes | Auth type discriminator |
| `username` | string | Yes | SAML username (often email) |
| `password` | string | Yes | SAML password |
| `sapUser` | string | Yes | SAP system username for object attribution |
| `providerConfig` | object | No | Custom login form configuration |

**Note:** The `sapUser` field is required because SAML identity providers typically use email addresses as usernames, but SAP systems require the actual SAP username for object attribution (`adtcore:responsible`).

**providerConfig fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ignoreHttpsErrors` | boolean | Yes | Skip HTTPS certificate validation |
| `formSelectors` | object | Yes | CSS selectors for login form |
| `formSelectors.username` | string | Yes | Selector for username field |
| `formSelectors.password` | string | Yes | Selector for password field |
| `formSelectors.submit` | string | Yes | Selector for submit button |

**Example (Standard SAP IDP):**
```json
{
    "type": "saml",
    "username": "user@example.com",
    "password": "secret123",
    "sapUser": "SAPUSER01"
}
```

**Example (Custom Login Form):**
```json
{
    "type": "saml",
    "username": "user@example.com",
    "password": "secret123",
    "sapUser": "SAPUSER01",
    "providerConfig": {
        "ignoreHttpsErrors": true,
        "formSelectors": {
            "username": "#USERNAME_FIELD-inner",
            "password": "#PASSWORD_FIELD-inner",
            "submit": "#LOGIN_LINK"
        }
    }
}
```

**Default form selectors** (standard SAP IDP):
- `username`: `#j_username`
- `password`: `#j_password`
- `submit`: `#logOnFormSubmit`

**Session timeout:** 30 minutes

**Requirements:**
- Playwright must be installed: `npm install playwright`
- First run may download Chromium browser

---

### SSO Auth

Kerberos-based SSO using mTLS certificates from SAP Secure Login Server (SLS).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"sso"` | Yes | Auth type discriminator |
| `slsUrl` | string | Yes | SAP Secure Login Server URL |
| `profile` | string | No | SLS profile name (default: `SAPSSO_P`) |
| `servicePrincipalName` | string | No | Kerberos SPN override |
| `forceEnroll` | boolean | No | Force certificate re-enrollment |

**Example:**
```json
{
    "type": "sso",
    "slsUrl": "https://sapsso.corp.example.com"
}
```

**Example (Custom Profile):**
```json
{
    "type": "sso",
    "slsUrl": "https://sapsso.corp.example.com",
    "profile": "CUSTOM_PROFILE",
    "forceEnroll": true
}
```

**Session timeout:** 3 hours

**Authentication flow:**
1. Obtain Kerberos SPNEGO token via Windows SSPI or MIT Kerberos
2. Authenticate to SLS with SPNEGO token
3. Generate RSA keypair and CSR
4. Request certificate from SLS
5. Use mTLS with obtained certificate for all ADT requests

**Certificate storage:** `./certificates/sso/{username}_full_chain.pem` and `./certificates/sso/{username}_key.pem`

**Requirements:**
- `kerberos` package must be installed: `npm install kerberos`
- Windows: Requires Active Directory integration (uses SSPI)
- Linux/macOS: Requires MIT Kerberos with valid ticket (`kinit`)
- `insecure: true` typically required (corporate CAs not in trust store)

---

*Last updated: v0.4.5*
