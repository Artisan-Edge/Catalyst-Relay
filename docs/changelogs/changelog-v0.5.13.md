# Changelog - v0.5.13

## Release Date
May 1, 2026

## Overview
Fixes a regression that caused object activation to fail immediately due to an invalid `Accept` header, and hardens the activation poll loop against tight retry loops and unrecoverable errors.

## What's New

### Activation No Longer Crashes Instantly
Activation requests previously sent `Accept: application/xml`, which SAP's activation endpoint rejects outright. The client now sends the correct background-run media type (`application/vnd.sap.adt.backgroundrun.v1+xml`) on both the initial activation request and the long-poll for run completion. Activations — particularly long-running ones that go through the background-run flow — now succeed instead of failing on the very first call.

### More Resilient Activation Polling
Three behavioral improvements to the poll loop that waits for an activation run to complete:

- **1-second delay between retries.** When a server returns early from a long-poll without the run being complete, the client now waits before retrying instead of hammering the endpoint in a tight loop.
- **4xx responses are now terminal.** Client-side errors (bad request, auth, etc.) won't recover by retrying, so the client fails fast with the server's error message instead of burning all 30 poll attempts.
- **Clearer timeout errors.** The "did not complete" error now reports how many attempts were made, making it easier to distinguish a genuine long-running activation from a stuck one.

## Technical Details

- `src/core/adt/craud/activation.ts`:
  - Introduced `BACKGROUND_RUN_MEDIA_TYPE` constant (`application/vnd.sap.adt.backgroundrun.v1+xml`) used for both the initial POST and the long-poll GET.
  - Introduced `POLL_RETRY_DELAY_MS` (1000ms) and added a `setTimeout`-based delay between poll attempts.
  - Refactored the poll loop from a `while` with manual counter to a `for` loop; added a 4xx short-circuit branch that returns early with the extracted error.
  - Updated the timeout error message to include the attempt count.

## Commits Included
- 8bc540c - [BUGFIX] Fixing issues with long term activation
