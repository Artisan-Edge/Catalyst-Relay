# Changelog - v0.11.0

## Release Date

November 10, 2026

## Overview

SSO can now get its SPNEGO token from the caller. A new optional `spnegoTokenProvider(servicePrincipalName)` setting on the SSO auth config replaces the `kerberos` package, so hosts that cannot load that native module (for example a Bun-compiled exe such as Catalyst-CLI) can fetch the token from an external helper like `catalyst-auth.exe`.

## Breaking Changes

None. Without `spnegoTokenProvider`, SSO behaves as before and still needs the `kerberos` package.

## What's New

### Pluggable SPNEGO token provider

`auth.spnegoTokenProvider` is a function `(spn: string) => Promise<string>` that returns the base64 SPNEGO token (the part after `Negotiate `).

- **The `kerberos` module is never loaded** when a provider is set, so it does not need to be installed.
- **The SPN** passed to the provider is `servicePrincipalName` if set, otherwise `HTTP/<slsUrl host>`.
- **The token is trimmed** (a trailing newline from a helper's output is removed) and sent as `Authorization: Negotiate <token>`. Only the first SPNEGO leg is sent.
- **Errors:** a provider that throws fails enrollment with `SPNEGO token provider failed: <message>`. An empty token fails with `Failed to generate SPNEGO token: the token provider returned an empty token`. SLS is not contacted in either case.
- **Library only:** a function cannot be serialized, so the setting is not available through JSON config.

```typescript
auth: {
    type: 'sso',
    slsUrl: 'https://sapsso.corp.example.com:50001',
    profile: '1546b978-7951-4690-b0b8-ad04f38d7050',
    spnegoTokenProvider: async (spn) => runCatalystAuth(['spnego', '--spn', spn]),
}
```

## Technical Details

- **Types:** new exported type `SpnegoTokenProvider` (`src/types/config.ts`, re-exported from `src/index.ts`). `SsoAuthConfig` gains the optional `spnegoTokenProvider` field, and `clientConfigSchema` accepts it as a function.
- **Plumbing:** `createAuthStrategy` (`factory.ts`) passes the provider to `SsoAuth`, which hands it to `enrollCertificate` and `authenticateToSls` (`slsClient.ts`).
- **`getSpnegoToken(spn, tokenProvider?)`** (`kerberos.ts`) calls the provider through a new `getProvidedToken` helper when one is given, and only otherwise loads the `kerberos` module.
- **Docs:** `README.md` (optional dependencies note) and `docs/endpoints/auth.md` (SSO config table, token provider section, requirements).
- **Tests:** new `src/__tests__/core/auth/ssoTokenProvider.test.ts` covers the provider token reaching the SLS login for the configured SPN and profile, a throwing provider, and an empty token.

## Commits Included

- da46ddb - [UPDATE] Pluggable SPNEGO token provider for SSO
