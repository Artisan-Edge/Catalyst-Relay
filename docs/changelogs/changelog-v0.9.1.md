# Changelog - v0.9.1

## Release Date

November 5, 2026

## Overview

A patch for redeploys. SAP pretty-prints CDS sources when it saves them (`label : 'x'`, aligned `key a      : t`), so a table that was just written read back different and every later `upsert()` saved it again and recorded it on the transport again. CDS sources now compare equal when they differ only in whitespace next to punctuation. `gitDiff()` now agrees with `upsert()`: no hunks when the object would be `unchanged`.

## Breaking Changes

None of the method signatures change. Callers will notice these differences:

- **`upsert()` reports more CDS sources `unchanged`.** Tables, structures, CDS views, access controls, behavior definitions and service definitions that differ from the server only in whitespace next to a separator are no longer re-saved.
- **String literals in CDS sources are compared exactly.** The old comparison collapsed whitespace inside literals too, so `'a  b'` and `'a b'` were equal. They now differ, which is slightly stricter than before.
- **`gitDiff()` returns no hunks when `upsert()` would report `unchanged`.** This applies to every extension, using `contentEquivalent()`: CDS layout differences, ABAP indentation and line-break differences, and form or AFF JSON sources that are equal as values. A real change still returns the full line diff, layout lines included.
- **`ObjectConfig` has a new optional field `cdsSource`.** Code that builds an `ObjectConfig` by hand needs no change.

## What's New

### CDS sources ignore whitespace next to separators

The comparison behind `upsert()`'s `unchanged` (`contentEquivalent()`) has a CDS rule for object types whose `ObjectConfig.cdsSource` is `true`:

| Extension  | Type                |
| ---------- | ------------------- |
| `asddls`   | CDS view            |
| `asdcls`   | Access control      |
| `astabldt` | Table               |
| `astablds` | Structure           |
| `asbdef`   | Behavior definition |
| `srvd`     | Service definition  |

The rule (BOM ignored, case kept):

- **Separators** are `: ; , . { } ( ) [ ] = < >`. Whitespace next to one is dropped; any other run of whitespace becomes one space, and leading and trailing whitespace is trimmed.
- **Left out on purpose:** `+ - * /` (`--` and `//` start comments, and `/` is part of namespaced names like `/ABC/TAB`), and `#` and `@`, which prefix a word.
- **Operators are not joined:** whitespace between `<`, `>` or `!` and a following `=` or `>` is kept, so `a < = b` is not `a <= b`.
- **String literals** (`'…'`, a backslash escapes the next character) are compared exactly.
- **Comments** (`//`, `--`, `/* */`) are compared with their whitespace collapsed. A line comment keeps its line end, so code moved into a comment is still a change.

```typescript
// Local file
// @EndUserText.label: 'Valid CDS to Table mapping'
// define table zsnap_c2t_map {
//     key mandt: mandt not null;

// As SAP saved it
// @EndUserText.label : 'Valid CDS to Table mapping'
// define table zsnap_c2t_map {
//
//   key mandt      : mandt not null;

contentEquivalent("astabldt", local, server); // [true, null]
```

ABAP sources (`aclass`, `asprog`, `asinc`, `asfunc`, `asfugr`, `asfinc`) are compared as before, because in ABAP spacing is significant (`a-b` vs `a - b`, `foo( x )` vs `foo(x)`). Form objects and number range objects keep their own comparisons.

### `gitDiff()` agrees with `upsert()`

`gitDiff()` now calls `contentEquivalent()` first and returns an empty `diffs` array when the sources are equivalent. Catalyst-CLI's `adt diff` then shows a just-deployed table as identical instead of listing SAP's pretty-printing.

## Technical Details

- **Changed** `src/core/utils/content.ts`: new `normalizeCdsContent()` (a small tokenizer for literals, comments and separators), exported from the `core/utils` barrel only.
- **Changed** `src/core/adt/types.ts`: `ObjectConfig.cdsSource`, set on `asddls`, `asdcls`, `astabldt`, `astablds`, `srvd` and `asbdef`.
- **Changed** `src/core/adt/craud/contentEquivalent.ts`: uses `normalizeCdsContent()` when `cdsSource` is set. The order is AFF JSON, forms, CDS, then plain text.
- **Changed** `src/core/adt/craud/gitDiff.ts`: no hunks when `contentEquivalent()` says equal.
- **Docs** `docs/endpoints/diff.md` describes when `diffs` is empty, and was reformatted with Prettier.
- **Tests** New unit tests for `normalizeCdsContent()` (the table example, literals, real token changes, operators, comments), `contentEquivalent()` across the CDS and ABAP extensions, and `gitDiff()` (layout-only table difference has no hunks; a real change does). 555 unit tests pass and `bun run typecheck` is clean.

## Verification

Unit tests only. The integration suites, which need a live SAP system, were not run for this change.

## Commits Included

- ac43ae6 - [UPDATE] CDS sources compare whitespace-insensitively next to separators (upsert unchanged); gitDiff returns no hunks when upsert would report unchanged
