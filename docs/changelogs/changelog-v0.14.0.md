# Changelog - v0.14.0

## Release Date

November 19, 2026

## Overview

The client gains `runAtc(options)`, which runs the ABAP Test Cockpit (ATC) on objects, packages and transports, waits for the run to finish, and returns the findings together with a release verdict (`summary.releasable`) that mirrors the check a transport release performs.

## Breaking Changes

None. The release only adds a client method and its types. There is no server (HTTP) route for ATC in this release.

## What's New

### ATC runs

- **`client.runAtc(options)`** returns `{ checkVariant, worklistId, objects, summary }`. It fails with `Not logged in` before login, and with `No objects, packages or transports to check` when none of `objects`, `packages` or `transports` is given.
- **What it checks:** any mix of `objects` (`ObjectRef[]`), `packages` (subpackages included) and `transports` (a request or a task; a request covers its tasks).
- **Check variant:** `checkVariant` is optional. When omitted, the system's own variant is read from ATC customizing, which is the variant transport release checks with (`ABAP_CLOUD_DEVELOPMENT_DEFAULT` on public cloud). If the system names none, the call fails and asks for one explicitly.
- **Background run, polled:** the run is started with `clientWait=false` and polled every `pollInterval` ms (default 3 s) until it completes, for at most `timeout` ms (default 30 minutes). Per `docs/sap-adt.md`, starting without `clientWait=false` blocks until the run ends, and a 25-class transport (about 13 minutes) did not answer within 10 minutes. If the timeout passes, the error says the run keeps running on SAP and names the worklist id. If SAP ends the run in a status other than completed, the error carries that status and description.
- **Progress:** `onProgress` is called whenever the run's status, description or phase changes, with `{ status, description, phase? }`.
- **Findings:** each `AtcObject` (`type`, `name`, `packageName`, `author`, `findings`) lists its `AtcFinding`s: `uri`, `location` (`uri`, `line`, `column`), `priority` (1 error, 2 warning, 3 info), `checkId`, `checkTitle`, `messageId`, `messageTitle`, `effectOnTransports`, `blocksTransport`, `exemptionKind`, `exemptionApproval`, `processor` and optional `tags`. Exempted findings are left out unless `includeExempted` is true.
- **Release verdict:** `blocksTransport` is true for any `effectOnTransports` other than `allowTransports`. `summary` carries `objectsWithFindings`, `findings`, `errors`, `warnings`, `infos`, `blocking` and `releasable` (true when no finding blocks a transport release). Per `docs/sap-adt.md`, with `ABAP_CLOUD_DEVELOPMENT_DEFAULT` errors and warnings block.
- **The summary counts objects with findings, not objects checked.** SAP's worklist lists only objects that have findings (documented example: a task of about 60 objects listed 25), so relay cannot report how many objects were checked. The field is named `objectsWithFindings` for that reason, and `objects` holds only the worklist's objects. The commit that introduced `runAtc` first named this count `objects`; it was renamed before this release, so no released API ever carried the old name.
- Types `AtcRunOptions`, `AtcRunProgress`, `AtcRunResult`, `AtcSummary`, `AtcObject`, `AtcFinding` and `AtcFindingLocation` are exported from the package root.

### Not included

- Releasing a transport is not implemented. `docs/sap-adt.md` records that the release endpoint runs the same check synchronously and did not answer within 10 minutes, and that how Eclipse starts the equivalent background run is unknown.

## Technical Details

- New `src/core/adt/atc/`: `runAtc` (orchestration, polling, timeout), `getAtcCustomizing` (system check variant), `startAtcRun` (creates the worklist, then posts the run), `getAtcRunStatus`, `getAtcWorklist`, `parseAtcWorklist` (worklist XML to objects, plus `summarizeAtc`) and `types`.
- New `src/client/methods/atc/runAtc.ts`, wired into `ADTClient` and `ADTClientImpl`.
- `core/adt/index.ts` exports `runAtc`, `getAtcCustomizing`, `AtcCustomizing` and the ATC types; `src/index.ts` re-exports the types.
- Tests: new cases in `src/__tests__/core/adt/atc/atc.test.ts` with four fixtures under `src/__tests__/fixtures/atc/` (customizing, running and completed run status, a transport worklist). These tests were not run for this changelog.
- Docs: `README.md` method table; new "ATC" section in `docs/sap-adt.md` (endpoints, request and response shapes, timing, verdict rules). That section states the flow was verified on S/4HANA Public Cloud with `ABAP_CLOUD_DEVELOPMENT_DEFAULT`; it was not re-verified for this changelog.

## Commits Included

- e19f451 - [UPDATE] client.runAtc: ATC on objects, packages and transports as a background run (clientWait=false), polled to completion, with the worklist's findings and a release verdict (summary.releasable from effectOnTransports; on public cloud errors and warnings block)
- 0c0c801 - [FIX] ATC summary counts objectsWithFindings instead of objects: the worklist lists only objects with findings (a ~60-object task listed 25), so it cannot report what was checked
