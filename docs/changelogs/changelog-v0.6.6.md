# Changelog - v0.6.6

## Release Date
July 1, 2026

## Overview
Fixes over-eager session resets on SAP public cloud sessions. A `500` response is no longer treated as a dead session unless the response body actually says so, and SAML sessions are never auto-reset.

## Breaking Changes
None. Behavior change only; no signatures changed.

## What's New

### Smarter handling of `500` responses

Previously, **any** `500` from the ADT server triggered an automatic session reset, and if that reset failed the original request returned a synthetic "Session reset failed" error instead of the server's actual response.

The problem: SAP surfaces ordinary **application errors** as `500` too — not just dead sessions. On public cloud in particular, this caused healthy sessions to be reset on every application-level `500`, and masked the real error the server returned.

Now the relay:

- **Only resets when the body indicates a dead session** — the response text must mention a session *and* one of "timed out", "expired", "no longer exists", or "not found". Application errors fall through untouched.
- **Excludes SAML sessions from reset entirely.** A reset performs a logoff, which destroys the browser-established cookies that a SAML flow cannot re-acquire headlessly. Resetting a SAML session would effectively kill it.
- **Always returns the server's original `500` response**, even if a reset was attempted and failed. A failed reset is now logged via `debugError` rather than replacing the real response with a reset-failure error.

Net effect for consumers: application errors on public cloud now surface with their real server response, and SAML sessions survive spurious `500`s.

## Technical Details

### `src/client/methods/internal/request.ts`

- Added an `isSessionError` gate (regex over the response body) before attempting `sessionOps.sessionReset`.
- Added an `config.auth.type !== 'saml'` guard around the reset.
- Reset failures are now logged (`debugError`) instead of short-circuiting the response with an `err(...)`; the original `500` is always returned to the caller.

## Commits Included
- bf73cdc - [UPDATE] Public cloud session fixes
