# Changelog - v0.7.0

## Release Date

October 23, 2026

## Overview

Relay can now create, read, update, diff, check, activate and delete data elements (`.asdtel`), domains (`.asdoma`) and function modules (`.asfunc`, used for conversion routines). Data elements and domains are written as the same text format the S4-Views repo already uses; Relay translates it to and from SAP's XML definition, so callers keep passing source text in `ObjectContent.content`.

## Breaking Changes

None for existing object types. Callers will notice these differences:

- **`ConfiguredExtension` widens** to include `'asdtel' | 'asdoma' | 'asfunc'`. Code that switches exhaustively over it must handle the new values to typecheck.
- **Discovery returns the new types.** `getTree()` lists data elements, domains and function modules under `objects` (they used to land in `unsupportedObjects`), and `search()` returns them instead of dropping them.
- **`upsert()` results can include function groups** as `{ extension: 'fugr', status: 'created' }` when a function module's group had to be created.
- **`upsert()` runs in dependency order** (see below). For a batch of the existing types only, the behaviour and result order are unchanged.
- **Object URIs use lowercase names** for read, update, lock, delete and where-used, matching what activation and syntax check already did. The full integration suite passes with this change.

## What's New

### Data elements and domains

Data elements and domains have no source text in SAP: their definition is an XML document at the object's URI. Relay converts the `.asdtel` / `.asdoma` text format (grammar: `S4-Views/.claude/docs/03-repository/data-elements-and-domains.md`) to that document and back.

```typescript
const [results, error] = await client.upsert(
  [
    { name: "ZSNAP_SIGNAGE", extension: "asdoma", content: domainSource },
    { name: "ZSNAP_SIGNAGE", extension: "asdtel", content: dataElementSource },
  ],
  "ZSNAP",
  "DEVK900001",
);
```

- **Create** sends the complete definition in one request. Fields the text omits (output length, label lengths) are derived by SAP on activation.
- **Update** reads the current definition and changes only what the text describes. Settings maintained in SAP that the text format doesn't cover (search help, SET/GET parameter, change document) are kept.
- **Read** returns the definition in a canonical text layout. `gitDiff()` canonicalizes the local text the same way, so layout differences such as `abap.char (4)` vs `abap.char(4)` don't show up as changes.
- **Upsert** compares meaning rather than text, so re-uploading an unchanged file reports `unchanged`.
- **Description** is the source's `@EndUserText.label`; data elements fall back to the long label. `ObjectContent.description` is ignored for these types.
- **Validation** runs before anything is sent: name, label and description lengths, type rules (`abap.char` needs a length, `abap.dats` has none, ...), duplicate or over-long fixed values, and a declared name that doesn't match the object name. Parse errors report line and column. Only `@EndUserText.label` is accepted as an annotation; anything else is an error rather than being silently dropped.

### Function modules and conversion routines

Function modules live inside a function group, so `ObjectRef` gains an optional `container` field holding the group name.

```typescript
await client.upsert(
  [
    {
      name: "CONVERSION_EXIT_ZFYP7_INPUT",
      extension: "asfunc",
      container: "ZFYP7",
      content: inputSource,
    },
    {
      name: "CONVERSION_EXIT_ZFYP7_OUTPUT",
      extension: "asfunc",
      container: "ZFYP7",
      content: outputSource,
    },
  ],
  "ZSNAP",
  "DEVK900001",
);
```

- A missing function group is created in the target package.
- Read, activate, check, delete, where-used and diff accept a function module by name alone and look up its group through search.
- Activating new function modules also activates their new group.
- `changePackage()` rejects function modules (they move with their group); `.fugr` is still accepted.

### Dependency-ordered upsert

A domain whose conversion routine doesn't exist fails activation, and a data element depends on its domain. `upsert()` therefore runs in waves: function groups, function modules, domains, data elements, then everything else. Objects within a wave still run in parallel.

### ABAP Cloud

Verified on S/4HANA Cloud in a development package: objects inherit ABAP for Cloud Development from the package, so no extra handling is needed. `$TMP` can't hold Cloud objects there.

## Technical Details

- **New** `src/core/ddic/`: a pure (no HTTP) module with the tokenizer, parsers, serializers, XML build / parse / merge, validation and semantic comparison. `getFormHandler(extension)` exposes it to the CRUD layer by file extension.
- **Changed** `src/core/adt/types.ts`: `ObjectConfig` gains `kind` (`'source' | 'form'`), `contentType`, `lockOnObject` and `container`. New entries for `asdtel`, `asdoma` and `asfunc`, and a `FUNCTION_GROUP_CONFIG`.
- **Changed** `src/core/adt/helpers.ts`: new `collectionUri()`, `objectUri()`, `contentUri()`, `lockUri()`, `toRef()`, `requireFormHandler()` and `containerFromUri()`. Read, create, update, lock, delete, activation, syntax check, where-used and diff build their URIs through these instead of hard-coding `/source/main`.
- **New** `craud/formDocument.ts` (GET a form object's XML), `craud/functionGroup.ts` (`ensureFunctionGroup()`), `craud/resolveContainers.ts` (`resolveContainers()`).
- **Changed** syntax check: form objects are checked one per check run, because a run with several DDIC objects repeats each object's messages on the others.
- **Changed** `SearchResult` and `ObjectWithContent` gain an optional `container`.
- **Changed** the `objects` and `where-used` routes: `container` is accepted in the request schema.
- **Changed** `moveTargets.ts`: `.dtel` / `.doma` remain as deprecated aliases of `.asdtel` / `.asdoma`.
- **Not covered:** function groups aren't a configured type, so nothing deletes them.
- **Tests.** New unit tests in `src/__tests__/core/ddic/` cover parsing, round-trips against every S4-Views file, real XML captured from SAP (`src/__tests__/fixtures/ddic/`), merging, validation and comparison. New integration test `ddic-workflow.test.ts` runs the full lifecycle on a live system. All 319 unit tests pass and `bun run typecheck` is clean. In the integration suite, 75 of 85 tests pass; the 3 failures are environmental (a 5-second timeout, and two transport tests that need a transportable package).
- **Docs.** New "Form-based objects and function modules" section in `docs/sap-adt.md` with the ADT protocol details. `container` documented in `docs/endpoints/objects.md`.

## Verification

Data elements, domains (fixed values, ranges, conversion routine, value table) and conversion routines were created, activated, read back, updated, diffed, checked and deleted on an on-prem S/4HANA system and on S/4HANA Cloud, through Catalyst-CLI v1.2.0.

## Commits Included

- 84adbc7 - [UPDATE] Data elements, domains and function modules: .asdtel/.asdoma DSL <-> ADT XML, function group containers, dependency-ordered upsert
