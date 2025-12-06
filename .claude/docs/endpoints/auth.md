# Authentication Endpoints

Session-based authentication for SAP ADT access.

## Sections

- [POST /login](#post-login)
- [DELETE /logout](#delete-logout)

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
| `auth` | object | Yes | Authentication configuration (see variants below) |
| `timeout` | number | No | Request timeout in ms (default: 30000) |
| `insecure` | boolean | No | Skip SSL verification (dev only) |

**Auth Variants:**

| Type | Fields | Description |
|------|--------|-------------|
| `basic` | `username`, `password` | Standard SAP credentials |
| `saml` | `username`, `password`, `provider?` | SAML SSO authentication |
| `sso` | `certificate?` | Kerberos/certificate auth |

### Response

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | string | UUID for `X-Session-ID` header |
| `username` | string | Authenticated SAP username |
| `expiresAt` | number | Session expiration (Unix ms) |

### Example

**Request:**
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
