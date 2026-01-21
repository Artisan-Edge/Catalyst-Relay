# SAP ADT Domain Knowledge

SAP-specific concepts and behaviors for working with ADT (ABAP Development Tools).

## Sections

- [CSRF Token Flow](#csrf-token-flow)
- [SSL Verification](#ssl-verification)

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

---

*Last updated: v0.4.5*
