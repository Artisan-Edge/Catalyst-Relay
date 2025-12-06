# Endpoint Documentation

Comprehensive documentation for all Catalyst-Relay HTTP endpoints.

## Sections

- [Categories](#categories)
- [Common Headers](#common-headers)
- [Response Format](#response-format)
- [Error Codes](#error-codes)

---

## Categories

| Category | Description |
|----------|-------------|
| [Authentication](./auth.md) | Session management (`/login`, `/logout`) |
| [Discovery](./discovery.md) | Browse SAP metadata (`/packages`, `/tree`, `/transports`) |
| [Objects](./objects.md) | CRAUD operations (`/objects/*`) |
| [Preview](./preview.md) | Data preview (`/preview/*`) |
| [Search](./search.md) | Object search (`/search`, `/where-used`) |

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
