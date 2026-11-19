# Changelog - v0.13.0

## Release Date

November 18, 2026

## Overview

Creating a transport on a system with several transport targets now fails with a typed error that carries the targets, and the client gains `getTransportTargets()` so a caller can offer a picker before creating anything. SSO login also changes: a stored certificate is reused until an hour before it expires, the Kerberos and token-provider steps give up after 30 seconds instead of hanging, and a session export only lists certificate files that were actually written.

## Breaking Changes

None for code that reads the API. The message text of the multiple-targets failure is unchanged, so code that parses it keeps working.

Behavior change for HTTP (server mode) callers: `POST /transports` with no `target` on a multi-target system now answers HTTP 409 with code `MULTIPLE_TRANSPORT_TARGETS` and a `targets` array. It used to answer HTTP 500 with code `UNKNOWN_ERROR`. A caller that treated every 500 from this route as a failure now sees a 409 for this case.

## What's New

### Transport targets

- **`client.getTransportTargets()`** returns `TransportTarget[]` (`{ name, description }`), the targets a new transport request may use (the create dialog's value help). It creates nothing. It fails with `Not logged in` before login.
- **`MultipleTransportTargetsError`**: `client.createTransport(config)` without `config.target` fails with this error when the system offers more than one target. Its `targets: TransportTarget[]` lists them, so the caller can let the user pick one and retry with `{ ...config, target }`. Narrow it with `instanceof MultipleTransportTargetsError`. A system with exactly one target still uses it automatically.
- Both the error class and the `TransportTarget` type are exported from the package root.
- **Server mode:** `POST /transports` returns 409 `MULTIPLE_TRANSPORT_TARGETS` with `targets` in the body (see Breaking Changes).

### SSO authentication

- **Certificate reuse:** a stored SSO certificate is reused, with no enrollment, until an hour before it expires. The previous buffer was one day. Per the commit message, SLS certificates live about 10 hours, so the one-day buffer re-enrolled on every login. `forceEnroll` still always enrolls.
- **30-second timeout:** the SPNEGO token provider and the `kerberos` package must answer within 30 seconds. Otherwise login fails with `SSO token provider did not respond within 30s` or `Kerberos did not respond within 30s`, instead of waiting forever.
- **Session export lists only written certificates:** `exportSessionState` includes `ssoCertPaths` only when the certificates were saved to, or loaded from, those files. With `returnContents` (certificates kept in memory), the field is omitted. Before, it was always set for SSO and could name files that did not exist. `importSessionState` records the paths it loaded from, so an imported session exports them again.

## Technical Details

- New `src/client/methods/transport/getTransportTargets.ts`, wired into `ADTClient`. It calls the existing core `getTransportTargets`.
- `MultipleTransportTargetsError` is defined in `core/adt/transports/createTransport.ts` and replaces the plain `Error` in `resolveTarget`. The server route `routes/discovery/createTransport.ts` maps it to 409.
- `core/auth/sso/kerberos.ts`: `withTimeout` races both token paths against a 30-second timer (`TOKEN_TIMEOUT_MS`) and clears the timer either way.
- `core/auth/sso/sso.ts`: `CERT_REUSE_BUFFER_DAYS = 1 / 24` is passed to `isCertificateExpired` when loading stored certificates. `SsoAuth` tracks where its certificates live and exposes them through the new optional `AuthStrategy.getStoredCertificatePaths()`.
- `SsoCerts` (client state) gains an optional `paths`. `login` and `importSessionState` fill it, and `exportSessionState` reads it instead of recomputing the default paths.
- Tests: new `transportTargets.test.ts`; added cases in `createTransport`, `sso`, `ssoTokenProvider` and `exportSessionState` tests. The reuse-buffer test was updated for the one-hour buffer. These tests were not run for this changelog.
- Docs: `README.md` method table, `docs/endpoints/discovery.md` (409 response, error table, `TransportConfig` listing now matches the code) and `docs/endpoints/auth.md` (certificate storage path corrected to `~/.catalyst/certificates/sso/`, reuse, timeout, optional `ssoCertPaths`).

## Commits Included

- 18c0606 - [UPDATE] client.getTransportTargets and a typed MultipleTransportTargetsError, 30s SPNEGO token timeout, SSO certificate reuse, session export only lists certificate paths that were written
- bff01f0 - [UPDATE] Reuse a stored SSO certificate until an hour before expiry, not 5 minutes, so a reused certificate stays good for a working session's new connections
