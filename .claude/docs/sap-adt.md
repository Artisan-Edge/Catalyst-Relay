# SAP ADT Domain Knowledge

SAP-specific concepts and behaviors for working with ADT (ABAP Development Tools).

## Sections

- [Client ID Format](#client-id-format)
- [Config File](#config-file)
- [CSRF Token Flow](#csrf-token-flow)
- [SSL Verification](#ssl-verification)

---

## Client ID Format

Client IDs follow: `SystemId-ClientNumber` (e.g., `MediaDemo-DM1-200`)

| Part | Example | Purpose |
|------|---------|---------|
| System ID | `MediaDemo-DM1` | Looks up URL in config.json |
| Client Number | `200` | Passed as `sap-client` query param |

Multiple SAP clients (100, 200, etc.) share the same server URL.

---

## Config File

`config.json` maps system IDs to URLs:

```json
{
    "MediaDemo-DM1": {
        "adt": "https://50.19.106.63:443"
    }
}
```

Use `loadConfigFromEnv()` which defaults to `./config.json` or reads from `RELAY_CONFIG` env var.

---

## CSRF Token Flow

SAP requires CSRF tokens for state-changing requests:

1. First request sends header `x-csrf-token: fetch`
2. Server returns token in response header
3. All subsequent requests include that token
4. On 403 "CSRF token validation failed" → auto-refresh and retry

---

## SSL Verification

The Python reference disables SSL verification (`verify: False`). This is intentional for SAP systems with self-signed certs.
