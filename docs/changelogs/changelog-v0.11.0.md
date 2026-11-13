# Changelog - v0.11.0

## Release Date

November 10, 2026

## Overview

SSO can now get its SPNEGO token from the caller. A new optional `spnegoTokenProvider(servicePrincipalName)` setting on the SSO auth config replaces the `kerberos` package, so hosts that cannot load that native module (for example a Bun-compiled exe such as Catalyst-CLI) can fetch the token from an external helper like `catalyst-auth.exe`.

The relay also moves from zod 3 to zod 4, which fixes a memory-exhaustion advisory in zod (GHSA-mrhx-c7xc-m3w5).

## Breaking Changes

No API changes. Without `spnegoTokenProvider`, SSO behaves as before and still needs the `kerberos` package.

The zod 4 upgrade rewords validation error messages and rejects `Infinity` for two timeout settings (see [zod 4](#zod-4)). Code that matches on validation message text needs updating.

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

### zod 4

zod is now `^4.6.7` (was `^3.24.0`). Versions of zod before 4.6.6 record one issue for every failing array element with no limit, so a very large invalid array in a request could exhaust memory. There is no zod 3 fix. The exported types are unchanged and no zod types are exposed.

- **Reworded validation messages.** These appear in `createClient` errors, `parseMessageClass` errors and HTTP 400 `VALIDATION_ERROR` bodies. Prefixes and field paths are unchanged; only zod's own wording differs:

  | Case                    | Before (zod 3)                                         | Now (zod 4)                                          |
  | ----------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
  | Missing field           | `Required`                                             | `Invalid input: expected string, received undefined` |
  | Bad URL                 | `Invalid url`                                          | `Invalid URL`                                        |
  | String too short        | `String must contain at least 1 character(s)`          | `Too small: expected string to have >=1 characters`  |
  | String too long         | `String must contain at most 3 character(s)`           | `Too big: expected string to have <=3 characters`    |
  | Unknown key (`.asmsag`) | `Unrecognized key(s) in object: 'x'`                   | `Unrecognized key: "x"`                              |
  | Wrong type              | `Expected string, received number`                     | `Invalid input: expected string, received number`    |
  | Bad enum value          | `Invalid enum value. Expected 'Managed', received 'x'` | `Invalid input: expected "Managed"`                  |

- **`Infinity` rejected:** `createClient` rejects `timeout` and `autoRefresh.intervalMs` set to `Infinity`.
- **URL trimming:** in server mode, surrounding whitespace is trimmed from `url` and `slsUrl`. The same URLs are accepted as before, including hosts without dots such as `http://sapdev:8000`.

## Technical Details

- **Types:** new exported type `SpnegoTokenProvider` (`src/types/config.ts`, re-exported from `src/index.ts`). `SsoAuthConfig` gains the optional `spnegoTokenProvider` field, and `clientConfigSchema` accepts it as a function.
- **Plumbing:** `createAuthStrategy` (`factory.ts`) passes the provider to `SsoAuth`, which hands it to `enrollCertificate` and `authenticateToSls` (`slsClient.ts`).
- **`getSpnegoToken(spn, tokenProvider?)`** (`kerberos.ts`) calls the provider through a new `getProvidedToken` helper when one is given, and only otherwise loads the `kerberos` module.
- **Docs:** `README.md` (optional dependencies note) and `docs/endpoints/auth.md` (SSO config table, token provider section, requirements).
- **Tests:** new `src/__tests__/core/auth/ssoTokenProvider.test.ts` covers the provider token reaching the SLS login for the configured SPN and profile, a throwing provider, and an empty token.
- **zod 4 APIs:** deprecated calls are replaced: `.strict()` → `z.strictObject` (`parseMessageClass.ts`), `z.nativeEnum` → `z.enum` (`requests.ts`), `z.string().url()` → `z.url()` (`config.ts`).
- **zod imports:** all imports use `import * as z from 'zod'`, so bundlers can drop zod's unused locales. A minified bundle of the relay `dist` shrinks from 979 KB to 681 KB.
- **zod stays external:** zod is still an external dependency of `dist`, and `dist/index.d.ts` is unchanged.

## Commits Included

- da46ddb - [UPDATE] Pluggable SPNEGO token provider for SSO
- 3b38502 - [UPDATE] Migrate to zod 4 (#9) (#10)
