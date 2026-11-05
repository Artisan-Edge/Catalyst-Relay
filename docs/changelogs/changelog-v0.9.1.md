# Changelog - v0.9.1

## Release Date

November 5, 2026

## Overview

A patch for redeploys and source comparison. SAP re-lays out CDS sources on activation (`label : 'x'`, aligned `key a      : t`), so a table that was just deployed read back different, and every later `upsert()` saved it again and recorded it on the transport again. CDS sources now compare equal when they differ only in whitespace next to punctuation. ABAP sources are now compared line by line instead of with all whitespace collapsed, which could hide real changes. `gitDiff()` hides differences `upsert()` would ignore for CDS, form and AFF JSON sources; ABAP always shows its line diff.

## Breaking Changes

None of the method signatures change. Callers will notice these differences:

- **`upsert()` reports more CDS sources `unchanged`.** Tables, structures, CDS views, access controls, behavior definitions and service definitions that differ from the server only in whitespace next to a separator are no longer re-saved.
- **String literals in CDS sources are compared exactly.** The old comparison collapsed whitespace inside literals too, so `'a  b'` and `'a b'` were equal. They now differ, which is slightly stricter than before.
- **`upsert()` saves ABAP indentation and line-break changes.** ABAP sources used to compare with every run of whitespace collapsed to one space. That treated a moved line break as no change, even when it moved code into or out of a `"` or `*` comment, and ignored spacing inside `'…'` and `|…|` literals. Now only line ends, trailing blanks and trailing blank lines are ignored, so an indentation-only change is saved.
- **`gitDiff()` returns no hunks for equivalent CDS, form and AFF JSON sources.** When `upsert()` would report one of these `unchanged`, `diffs` is empty. A real change still returns the full line diff, layout lines included. ABAP sources always return their line diff.
- **`ObjectConfig` has a new optional field `cdsSource`.** Code that builds an `ObjectConfig` by hand needs no change.
- **A form object whose server content does not parse** now fails comparison with `server content: <parse error>`, so the message says which side failed.

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
- **Operators are not joined:** whitespace between `<`, `>`, `!`, `=` or `-` and a following `=`, `>` or `<` is kept, so `a < = b` is not `a <= b` and `= >` is not `=>`.
- **String literals** (`'…'`) are compared exactly; a doubled `''` stays exact too.
- **Backslashes:** whether a backslash escapes a quote in a CDS literal is unknown, so a pair of sources where either contains a backslash is compared like ABAP (line by line) instead.
- **Comments** (`//`, `--`, `/* */`) are compared with their whitespace collapsed. A line comment keeps its line end, so code moved into a comment is still a change.
- **Zero-length string types:** SAP stores `abap.string` / `abap.rawstring` in table and structure DDL as `abap.string(0)` / `abap.rawstring(0)`, so a file with the bare form was planned as `updated` forever. In code (not in literals or comments), `abap.string(0)` now equals `abap.string` and `abap.rawstring(0)` equals `abap.rawstring`; `abap.` and the type name match case-insensitively. Any other length (`abap.string(256)`) is still a change.

```typescript
// Local file
// @EndUserText.label: 'Valid CDS to Table mapping'
// define table zsnap_c2t_map {
//     key mandt: mandt not null;

// As SAP laid it out on activation
// @EndUserText.label : 'Valid CDS to Table mapping'
// define table zsnap_c2t_map {
//
//   key mandt      : mandt not null;

contentEquivalent("astabldt", local, server); // [true, null]
```

The comparison runs in linear time (a 1M-character source takes well under a second).

### ABAP sources compare line by line

ABAP sources (`aclass`, `asprog`, `asinc`, `asfugr`, `asfinc`, `asfunc`) ignore only a BOM, CRLF vs LF, trailing blanks on a line and trailing blank lines, which SAP changes when it stores and returns a source. Everything else, indentation included, is compared exactly, because in ABAP spacing is significant (`a-b` vs `a - b`, `foo( x )` vs `foo(x)`).

Function modules keep one tolerance. ADT generates the `FUNCTION` statement (the signature) on read from the module's parameters, in its own layout. For example, `RFC_READ_TABLE` reads back as `function rfc_read_table\r\n  importing\r\n    value(query_table) like dd02l-tabname …`. Whitespace in that statement is ignored, unless it contains a literal (`DEFAULT 'X'`) or a comment; then it is compared strictly. The body is compared line by line.

### `gitDiff()` hides only what is safe to hide

`gitDiff()` calls `contentEquivalent()` for CDS, form and AFF JSON sources and returns an empty `diffs` array when they are equivalent. Catalyst-CLI's `adt diff` then shows a just-deployed table as identical instead of listing SAP's re-layout. ABAP sources always get their line diff.

## Technical Details

- **Changed** `src/core/utils/content.ts`:
  - New `normalizeCdsContent()`, a small linear-time tokenizer for literals, comments and separators that also reads `abap.string(0)` / `abap.rawstring(0)` as the bare types.
  - New `normalizeSourceLines()` (line ends, trailing blanks, trailing blank lines).
  - Both are exported from the `core/utils` barrel only. `normalizeContent()` is still used for the AFF JSON fallback.
- **New** `src/core/adt/functionGroup/moduleSourcesEquivalent.ts`: the function module rule.
- **Changed** `src/core/adt/types.ts`: `ObjectConfig.cdsSource`, set on `asddls`, `asdcls`, `astabldt`, `astablds`, `srvd` and `asbdef`.
- **Changed** `src/core/adt/craud/contentEquivalent.ts`: AFF JSON, then forms, then CDS (strict with a backslash), then function modules, then ABAP line by line.
- **Changed** `src/core/adt/craud/gitDiff.ts`: no hunks for equivalent CDS, form and AFF JSON sources.
- **Changed** `src/core/forms/formHandler.ts`: a server-side parse error in `equivalent()` is prefixed `server content: `.
- **Docs:**
  - `docs/endpoints/objects.md` says when `unchanged` is reported for each type family.
  - `docs/endpoints/diff.md` says when `diffs` is empty; it was also reformatted with Prettier.
  - `docs/sap-adt.md` covers CDS re-layout on activation and ADT's generated function module signature.
- **Tests:** new unit tests for:
  - `normalizeCdsContent()`: the table example, literals, real token changes, operators, comments, `abap.string(0)` and linear time.
  - `normalizeSourceLines()`.
  - `contentEquivalent()`: CDS across all six extensions, the backslash fallback, ABAP false equivalents, the function module signature, and form server errors.
  - `gitDiff()`: a layout-only table difference has no hunks, a real change does, and ABAP always gets its line diff.
  - 564 unit tests pass and `bun run typecheck` is clean.

## Verification

Unit tests only. The integration suites, which need a live SAP system, were not run for this change. `function-group-workflow` re-upserts ABAP sources and expects `unchanged`, so it is the one to run against the line-by-line rule. The function module signature layout was confirmed by reading `RFC_READ_TABLE` on a live system.

## Commits Included

- ac43ae6 - [UPDATE] CDS sources compare whitespace-insensitively next to separators (upsert unchanged); gitDiff returns no hunks when upsert would report unchanged
- (review fixes, this commit) - [UPDATE] ABAP sources compare line by line; CDS compare strict with a backslash, operator spacing kept, abap.string(0) = abap.string, linear time; gitDiff hides only equivalent CDS/form/AFF diffs
