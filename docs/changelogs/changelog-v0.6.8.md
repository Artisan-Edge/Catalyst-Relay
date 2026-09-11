# Changelog - v0.6.8

## Release Date

September 11, 2026

## Overview

SAML browser login now survives identity providers that do more than show a username/password form. It waits for a multi-factor approval, relays what the IdP page is showing (for example a PingID number to match), reports the IdP's own error text on a rejection, and can hand a visible browser window over to the user when automation is not enough. Previously any IdP step after the password — MFA, a device-profiling re-render, a redirect chain that took more than 30 seconds — produced a misleading "credentials rejected" error or, worse, a "successful" login with no SAP session.

## Breaking Changes

None. The default flow (headless Chromium, standard SAP IdP selectors) is unchanged for systems whose IdP posts straight back to SAP. Two optional fields are added to the SAML auth config; nothing existing is removed or renamed.

## What's New

### Login succeeds only when the browser is back on SAP

The old success test was "the password field is gone". A PingID page, an IdP error page or a blank redirect page all pass that test, so the relay harvested cookies with no SAP session in them and the CSRF fetch failed later with an unrelated error. The relay now polls the page after submitting the password and declares success only when the top frame is on the SAP host (`new URL(baseUrl).host`), then lets the landing page settle before collecting cookies.

### Multi-factor approval is waited for, and reported

After submitting the password the relay waits up to **120 seconds** for the return to SAP, instead of 30 seconds of network idle. A few seconds in, if the page is no longer the sign-on form, it calls the new `onStatus` callback with a hint that a multi-factor prompt is probably pending. While the wait continues it relays the IdP page's condensed visible text whenever it changes (rate-limited to once per 3 seconds), so a caller can show the user things like:

```
Identity provider page: Authentication Select the number displayed in your PingID mobile app 77 ...
Identity provider page: Authenticated ...
```

```typescript
const [client] = createClient({
  url,
  client: "080",
  auth: {
    type: "saml",
    username,
    password,
    sapUser,
    onStatus: (message) => console.error(message),
  },
});
```

`onStatus` is a plain function on `SamlAuthConfig` (`SamlLoginStatusCallback`). It is validated as a function by the Zod schema and passed through unchanged; it is not serialisable and therefore not available over the HTTP server.

### Rejections carry the IdP's message; silent re-renders are retried once

If the IdP answers the submit by rendering the sign-on form again (a genuine navigation, not the untouched form), the login fails with the text the page displays — collected from common message containers such as `[role="alert"]`, `.ping-messages`, `.ping-error`, `#globalMessages`. If the form comes back with **no** message, the relay lets the page's scripts settle and submits once more. PingFederate's ThreatMetrix device-profiling adapter does exactly this when its profiling requests have not finished by the time the form is posted; before, that surfaced as "check the username and password".

### Visible browser mode

`providerConfig.headless: false` launches a visible window. The relay still pre-fills and submits the form; if the automated attempt fails for any reason, it calls `onStatus` with the failure reason and a request to finish signing in by hand, then waits up to **5 minutes** for the browser to land on SAP. Intended for IdPs that need a one-time code, a CAPTCHA or an unusual page.

### Closing the browser is an error, not a hang

Under Bun, a closed browser window used to leave the CDP call pending forever; with nothing else on the event loop the host process exited silently with no output. The CDP client now rejects in-flight and future calls when the socket drops, and the login returns `The browser was closed before sign-in completed.` The Playwright transport does the same on page close.

### Timing tweak before submit

The relay now waits for the network to go quiet (up to 5 seconds) _before_ clicking submit, giving IdP page scripts time to finish. This is what makes the ThreatMetrix re-render rare rather than common.

## Technical Details

- **New** `src/core/auth/saml/loginSequence.ts` — the whole sign-on flow, written once against a small `PageDriver` interface (`evaluate`, `waitForIdle`, `topNavigations`). Owns the timeouts (`LOGIN_TIMEOUTS`), the page expressions, the outcome polling, the one-shot retry, the interactive hand-over and the error builders. Timeouts are overridable per call for tests.
- **New** `src/core/auth/saml/cdpTransport.ts` — the Bun/CDP transport, moved out of `browser.ts`: Chromium spawn, minimal WebSocket CDP client (now with a `closed` promise and fail-fast sends), request/navigation tracking, cookie extraction.
- **New** `src/core/auth/saml/playwrightTransport.ts` — the Node/Playwright transport, moved out of `browser.ts`, driving the same sequence.
- **Changed** `src/core/auth/saml/browser.ts` — reduced to the runtime dispatch and option types re-export.
- **Changed** `src/core/auth/saml/types.ts` — `SamlProviderConfig.headless?`, plus `SamlCredentials` / `SamlBrowserLoginOptions` (with `onStatus`) moved here from `browser.ts`.
- **Changed** `src/types/config.ts` — `SamlLoginStatusCallback` type; `SamlAuthConfig.onStatus?`; `SamlProviderConfig.headless?`; Zod schema entries for both.
- **Changed** `src/core/auth/saml/saml.ts`, `src/core/auth/factory.ts` — pass `onStatus` and `headless` through. `src/core/auth/saml/index.ts`, `src/index.ts` — new exports.
- **Tests** `src/__tests__/core/auth/samlLoginSequence.test.ts` (new, 10 tests) — a scripted fake `PageDriver` covers: straight return to SAP; MFA wait with hint and page-text relay; rejection with IdP message; one retry on a silent re-render and give-up on the second; overall timeout; two-step username-then-password pages; missing form; interactive hand-over success and failure.
- **Docs** `docs/endpoints/auth.md` — `onStatus`, `headless`, and a multi-factor note.

## Commits Included

- f085cc7 - [UPDATE] SAML login waits for MFA, relays IdP page text, supports visible browser
