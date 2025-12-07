# Changelog - v0.2.1

## Release Date
December 6, 2025

## Overview
Adds enterprise authentication support with SAML and Kerberos SSO, enabling Catalyst-Relay to integrate with corporate identity providers and SAP Secure Login Server environments.

## Breaking Changes
None. Existing basic auth users are unaffected.

## Business Impact

### New Authentication Methods
- **SAML Authentication**: Users in organizations with SAML-based identity providers (Azure AD, Okta, SAP IDP, etc.) can now authenticate using their corporate credentials. The library handles the browser-based SAML flow automatically via Playwright.

- **SSO (Kerberos) Authentication**: Windows domain-joined machines can authenticate seamlessly using Kerberos tokens and obtain mTLS certificates from SAP Secure Login Server. This enables true single sign-on without password prompts.

### Enterprise Readiness
These additions fulfill corporate requirements for centralized identity management. Organizations can now:
- Enforce SSO policies across SAP ADT access
- Audit authentication through their identity provider
- Avoid distributing service account credentials

### Backward Compatibility
Basic authentication remains the default and most common method. The new auth types are additive—existing integrations continue to work unchanged.

## Technical Details

### Auth Package Refactoring
The authentication module was reorganized from flat files into a structured hierarchy:
```
core/auth/
├── basic/          # Username/password auth
│   ├── index.ts
│   └── basic.ts
├── saml/           # SAML browser automation
│   ├── index.ts
│   ├── saml.ts
│   ├── browser.ts
│   ├── cookies.ts
│   └── types.ts
└── sso/            # Kerberos + mTLS
    ├── index.ts
    ├── sso.ts
    ├── kerberos.ts
    ├── slsClient.ts
    ├── certificate.ts
    ├── pkcs7.ts
    ├── storage.ts
    └── types.ts
```

### SAML Implementation
- Uses Playwright for headless browser automation
- Navigates to SAP system, follows SAML redirect to IDP
- Fills login form with configurable CSS selectors
- Extracts session cookies after successful authentication
- Supports custom IDP form selectors via `providerConfig`
- Default selectors work with standard SAP IDP login pages

### SSO Implementation
- Obtains Kerberos SPNEGO token via Windows SSPI or MIT Kerberos
- Authenticates to SAP Secure Login Server (SLS) with SPNEGO
- Generates RSA keypair and Certificate Signing Request (CSR)
- Requests X.509 certificate from SLS
- Caches certificates to filesystem (`./certificates/sso/`)
- Uses mTLS for all subsequent ADT requests
- Includes certificate expiry checking and auto-renewal

### New Dependencies
- `node-forge` (required): Certificate parsing and RSA key generation
- `playwright` (optional peer dep): Required for SAML auth
- `kerberos` (optional peer dep): Required for SSO auth

### ADT Client Updates
- `AdtClient` now accepts optional `certificates` parameter for mTLS
- Creates custom HTTPS agent with client certificates when SSO is used
- Session login flow updated to handle all three auth types

## Commits Included
- `27e6059` - [UPDATE] SSO support as well now
- `3c6209d` - [UPDATE] Refactor auth package and implement the SAML
- `ffa9839` - [UPDATE] Create a proper readme
