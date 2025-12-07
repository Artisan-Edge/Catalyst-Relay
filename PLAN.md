# SAML & SSO Implementation Plan

Implementation plan for adding SAML and SSO authentication to Catalyst-Relay, based on SNAP-Relay-API reference implementation.

## Background

### SAML Authentication (from SNAP-Relay-API)
Uses **Playwright browser automation**:
1. Launches headless Chromium browser
2. Navigates to `/sap/bc/adt/compatibility/graph`
3. Auto-fills login form with configurable selectors (supports multiple cloud providers)
4. Waits for page load completion
5. Extracts session cookies from browser context
6. Uses cookies for subsequent requests

**Key differences from Basic:**
- Different CSRF endpoint: `/sap/bc/adt/core/http/sessions`
- Different content type: `application/vnd.sap.adt.core.http.session.v3+xml`
- Requires `USER_MAP.json` to map email → SAP username
- 30-minute session timeout (vs 3 hours for Basic/SSO)

### SSO Authentication (from SNAP-Relay-API)
Uses **Kerberos + mTLS certificates**:
1. Authenticates to SAP Secure Login Server (SLS) using Kerberos SPNEGO token
2. Generates RSA keypair (2048-bit)
3. Creates PKCS#10 CSR with CLIENT_AUTH extended key usage
4. Requests certificate from SLS endpoint
5. Parses PKCS#7 response for client cert + CA chain
6. Persists to `./certificates/sso/` directory
7. Uses mTLS for subsequent ADT requests

**Constraints:**
- Windows-only (uses `kerberos_sspi`)
- Requires Active Directory integration

---

## SAML Implementation

### File Structure
```
src/core/auth/
├── index.ts            # Barrel exports
├── types.ts            # Shared auth types (AuthStrategy, AuthCookie)
├── factory.ts          # Auth strategy factory
├── basic/
│   ├── index.ts        # Barrel exports
│   └── basic.ts        # BasicAuth class
├── saml/
│   ├── index.ts        # Barrel exports
│   ├── saml.ts         # SamlAuth class
│   ├── types.ts        # FormSelectors, SamlProviderConfig, defaults
│   ├── browser.ts      # Playwright login automation
│   └── cookies.ts      # Cookie extraction/formatting
└── sso/
    ├── index.ts        # Barrel exports
    └── sso.ts          # SsoAuth class (placeholder)
```

### Steps

1. **Add Playwright dependency** — Add `playwright` as optional peer dependency
2. **Create SAML types** — Define provider-specific form selectors in `src/core/auth/saml/types.ts`
3. **Implement browser automation** — Create `src/core/auth/saml/browser.ts` for Playwright login flow
4. **Implement cookie extraction** — Create `src/core/auth/saml/cookies.ts` for cookie formatting
5. **Create barrel exports** — Create `src/core/auth/saml/index.ts`
6. **Update SamlAuth class** — Wire `performLogin()` to use browser automation
7. **Update auth types** — Add SAML-specific config types to `src/core/auth/types.ts`
8. **Update factory** — Update `src/core/auth/factory.ts` for new SAML config

**Note:** Users provide `SamlProviderConfig` directly when creating auth strategy. No config.json lookup.

---

## SSO Implementation (Future)

### File Structure
```
src/core/auth/
├── sso.ts              # Main SsoAuth class (update)
├── sso/
│   ├── index.ts        # Barrel exports
│   ├── types.ts        # Certificate types, SLS config
│   ├── kerberos.ts     # SPNEGO token generation
│   ├── slsClient.ts    # Secure Login Server communication
│   ├── certificate.ts  # RSA keypair, CSR generation
│   ├── pkcs7.ts        # PKCS#7 response parsing
│   └── storage.ts      # Certificate persistence
```

### Steps

1. **Add crypto dependencies** — Use `node:crypto` for RSA/CSR generation
2. **Create SSO types** — Define certificate types, SLS config
3. **Implement Kerberos auth** — Use `kerberos` package for SPNEGO tokens
4. **Implement SLS client** — Secure Login Server communication
5. **Implement certificate generation** — RSA keypair, CSR generation
6. **Implement PKCS#7 parsing** — Extract client cert + CA chain
7. **Implement certificate storage** — Persist certs to filesystem
8. **Update SsoAuth class** — Wire mTLS into request handling
9. **Add certificate refresh** — Handle certificate expiration/renewal

---

## Shared Changes (Future)

| Change | Location |
|--------|----------|
| Add `AuthStrategy.getCertificates?()` method | `src/core/auth/types.ts` |
| Update client to support mTLS | `src/core/client.ts` |
| Add auth-type-aware CSRF endpoints | `src/core/session/login.ts` |
| Add auth-type-aware session timeouts | `src/core/session/types.ts` |

---

## Platform Considerations

| Auth Type | Cross-Platform? | Notes |
|-----------|-----------------|-------|
| Basic | Yes | Works everywhere |
| SAML | Yes | Playwright works on Linux/Mac/Windows |
| SSO | **No** | Windows-only due to Kerberos SSPI |

---

## Progress Checklist

### SAML Implementation
- [x] Add Playwright dependency to package.json
- [x] Create `src/core/auth/saml/types.ts` with provider configs
- [x] Create `src/core/auth/saml/browser.ts` with Playwright login flow
- [x] Create `src/core/auth/saml/cookies.ts` with cookie extraction
- [x] Create `src/core/auth/saml/index.ts` barrel exports
- [x] Update `src/core/auth/saml.ts` to use new modules
- [x] Update `src/core/auth/types.ts` with SAML config types
- [x] Update `src/core/auth/factory.ts` for SAML config
- [x] Verify typecheck and build pass
- [x] Update documentation (endpoints/auth.md, CLAUDE.md)

### SSO Implementation (Future)
- [ ] Add kerberos dependency to package.json
- [ ] Create `src/core/auth/sso/types.ts`
- [ ] Create `src/core/auth/sso/kerberos.ts`
- [ ] Create `src/core/auth/sso/slsClient.ts`
- [ ] Create `src/core/auth/sso/certificate.ts`
- [ ] Create `src/core/auth/sso/pkcs7.ts`
- [ ] Create `src/core/auth/sso/storage.ts`
- [ ] Create `src/core/auth/sso/index.ts` barrel exports
- [ ] Update `src/core/auth/sso.ts` to use new modules
- [ ] Update `src/core/auth/types.ts` with SSO config types

### Shared Changes (Future)
- [ ] Add `getCertificates?()` to AuthStrategy interface
- [ ] Update client.ts for mTLS support
- [ ] Update session/login.ts for auth-type-aware CSRF
- [ ] Update session/types.ts for auth-type-aware timeouts