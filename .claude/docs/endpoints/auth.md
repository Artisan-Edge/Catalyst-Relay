# Authentication Endpoints

Session-based authentication for SAP ADT access.

## Sections

- [POST /login](#post-login)
- [DELETE /logout](#delete-logout)
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
| `providerConfig` | object | No | Custom login form configuration |

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
    "password": "secret123"
}
```

**Example (Custom Login Form):**
```json
{
    "type": "saml",
    "username": "user@example.com",
    "password": "secret123",
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
