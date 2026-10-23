# Changelog - v0.7.1

## Release Date

October 23, 2026

## Overview

A bug-fix patch. Writing the Test Classes include (`testclasses`, CCAU) of a class that doesn't have one yet no longer fails. `writeClassInclude()` now creates a missing include before writing its source.

## Breaking Changes

None. `writeClassInclude()` and `POST /objects/class-include` keep their signatures. A write to an include that already exists sends the same requests as before, plus one GET to check that the include exists.

## What's New

### Writing a missing class include creates it

SAP creates a class with its `definitions` (CCDEF), `implementations` (CCIMP) and `macros` (CCMAC) includes, but not `testclasses` (CCAU). `writeClassInclude()` only sent a PUT to the include, so writing unit tests into a class for the first time failed with:

```text
Failed to write testclasses include of class ZCSNAP_C2T_CONFIG: ZCSNAP_C2T_CONFIG=============CCAU does not have any inactive version
```

After taking the class lock, the write now checks whether the include exists (a GET that returns 404 when it doesn't). If it doesn't, the write creates it with a POST to `/oo/classes/<class>/includes`, the way Eclipse does, then writes the source as before. The create uses the same lock handle and transport.

```typescript
// Works on a class that has never had test classes
await client.writeClassInclude(
  "ZCL_MY_CLASS",
  "testclasses",
  source,
  "DEVK900123",
);
```

## Technical Details

- **New** `src/core/adt/craud/classInclude.ts`:
  - `classIncludeExists()` returns `false` on a 404 and `true` on a 2xx. Any other response returns an error.
  - `createClassInclude()` POSTs a `class:abapClassInclude` document with the include type, using the class lock handle and `corrNr`.
  - Both are exported from the `core/adt` barrel.
- **Changed** `src/client/methods/craud/specialcases/classes/writeClassInclude.ts`: lock → create the include if missing → PUT → unlock. The class is still always unlocked after the attempt.
- **Docs** `docs/endpoints/objects.md`: the `POST /objects/class-include` description says the include is created if missing.
- **Tests** No unit tests were added for the new functions. `bun run typecheck` is clean; the relay test suite was not run for this change.

## Verification

Verified on a live system through Catalyst-CLI v1.2.1:

- `adt class write-include --include-type testclasses` against a class with no test include: the include was created and the source written, and reading it back matched the local file.
- A folder upload created a new `$TMP` class and its test include in one run. Both reported `created`, a second run reported both `unchanged`, and the class activated cleanly. The class was deleted afterwards.

## Commits Included

- eca4a26 - [FIX] Class include write creates a missing include first (new classes have no testclasses/CCAU)
