# Changelog - v0.6.4

## Release Date
June 22, 2026

## Overview
Fixes premature aborts of object activation during long-running, multi-object workflows. The activation long-poll request now uses an extended socket-idle timeout so the connection stays open until the activation run actually finishes.

## Breaking Changes
None.

## What's New

### Activations no longer time out mid-poll

When activating objects, the relay long-polls SAP's background activation run (`withLongPolling=true`), which holds the connection open server-side — with no socket traffic — until the run completes. Under the default request timeout (~30s), large or multi-object activation batches that took longer than that on the server would abort the poll before SAP responded, surfacing as a spurious failure even though the activation was still in progress.

The poll request now sets a **1-hour** socket-idle timeout, long enough to outlast even large batch activations. This makes multi-activation workflows reliable.

- No API change — existing `activate` calls benefit automatically.
- The retry/attempt logic (`MAX_POLL_ATTEMPTS`, terminal-on-4xx) is unchanged; only the per-request socket timeout was raised.

## Technical Details

### Core Module — `src/core/adt/craud/activation.ts`

- Added `LONG_POLL_TIMEOUT_MS = 3_600_000` (1 hour).
- The activation run poll (`GET /sap/bc/adt/activation/runs/{runId}` with `withLongPolling=true`) now passes `timeout: LONG_POLL_TIMEOUT_MS` instead of relying on the client's default socket-idle timeout, which was too short for long server-side activation runs.

## Commits Included
- 233e935 - [UPDATE] Enabling long polling, for the sake of multi activation workflows
