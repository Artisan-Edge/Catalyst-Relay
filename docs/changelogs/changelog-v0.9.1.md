# Changelog - v0.9.1

## Release Date

November 5, 2026

## Overview

A patch for redeploys and source comparison. SAP rebuilds table and structure DDL on activation (`label : 'x'`, aligned `key a      : t`, `abap.string(0)`), so a table that was just deployed read back different, and every later `upsert()` saved it again and recorded it on the transport again. Tables and structures now compare equal when they differ only in that re-layout. All other sources are now compared line by line instead of with all whitespace collapsed, which could hide real changes. `gitDiff()` now shows exactly what `upsert()` would save.

## Breaking Changes

None of the method signatures change. Callers will notice these differences:

- **`upsert()` reports re-laid-out tables and structures `unchanged`.** A table or structure that differs from the server only in whitespace next to a separator, or in `abap.string(0)` vs `abap.string`, is no longer re-saved.
- **String literals in tables and structures are compared exactly.** The old comparison collapsed whitespace inside literals too, so `'a  b'` and `'a b'` were equal. They now differ, which is slightly stricter than before.
- **`upsert()` saves indentation and other formatting changes in every other source.** ABAP sources, CDS views, access controls, behavior definitions and service definitions used to compare with every run of whitespace collapsed to one space. That treated a moved line break as no change, even when it moved code into or out of a `"` or `*` comment, and ignored spacing inside `'…'` and `|…|` literals. Now only a BOM, line ends, trailing spaces and tabs and trailing blank lines are ignored, so a formatting-only edit is saved.
- **Only ASCII whitespace counts as whitespace.** A no-break space, a BOM after the first character, U+2028 or U+3000 is content in every comparison.
- **`gitDiff()` agrees with `upsert()`.** `diffs` is empty when `upsert()` would report `unchanged` (including a function module signature in ADT's layout). Otherwise the diff runs over the lines as `upsert()` compares them, so trailing blanks, indented blank lines and a bare CR are not hunks, while indentation changes are.
- **`gitDiff()` passes read errors through.** It used to report any read failure as `<name> does not exist on server`; it now returns the error from the read (e.g. an authorization error).
- **`ObjectConfig` has a new optional field `cdsSource`.** Code that builds an `ObjectConfig` by hand needs no change.
- **A form object whose server content does not parse** now fails comparison with `server content: <parse error>`, so the message says which side failed.

## What's New

### Tables and structures ignore SAP's re-layout

The comparison behind `upsert()`'s `unchanged` (`contentEquivalent()`) has a DDL rule for object types whose `ObjectConfig.cdsSource` is `true`: tables (`astabldt`) and structures (`astablds`). SAP rebuilds their source from the DDIC on activation. CDS views, access controls, behavior definitions and service definitions keep their source as written, so they use the line rule below.

The rule (BOM ignored, case kept, ASCII whitespace only):

- **Separators** are `: ; , . { } ( ) [ ] = < >`. Whitespace next to one is dropped; any other run of whitespace becomes one space, and leading and trailing whitespace is trimmed.
- **Left out on purpose:** `+ - * /` (`--` and `//` start comments, and `/` is part of namespaced names like `/ABC/TAB`), and `#` and `@`, which prefix a word.
- **Operators are not joined:** whitespace between `<`, `>`, `!`, `=` or `-` and a following `=`, `>` or `<` is kept, so `a < = b` is not `a <= b` and `= >` is not `=>`.
- **String literals** (`'…'`) are compared exactly; a doubled `''` stays exact too. A literal never spans lines.
- **Backslashes:** whether a backslash escapes a quote in a CDS literal is unknown. A pair of sources where either contains a backslash is equal only if it is equal under both readings (backslash as escape and as plain character). A stray backslash, e.g. in a comment, keeps the re-layout tolerance without risking a false match.
- **Comments** (`//`, `--`, `/* */`) are compared with their whitespace collapsed. A line comment keeps its line end, so code moved into a comment is still a change.
- **Zero-length string types:** SAP stores `abap.string` / `abap.rawstring` as `abap.string(0)` / `abap.rawstring(0)`, so a file with the bare form was planned as `updated` forever. In code (not in literals or comments), one `(0)` after `abap.string` / `abap.rawstring` is ignored, keeping the token boundary it stood for (`abap.string(0)not null` equals `abap.string not null`). `abap.` and the type name match case-insensitively. Any other length (`abap.string(256)`), a second `(0)`, or a longer name (`zabap.string`, `x.abap.string`) is still a change.

```typescript
// Local file
// @EndUserText.label: 'Valid CDS to Table mapping'
// define table zsnap_c2t_map {
//     key mandt: mandt not null;
//     message: abap.string;

// As SAP laid it out on activation
// @EndUserText.label : 'Valid CDS to Table mapping'
// define table zsnap_c2t_map {
//
//   key mandt      : mandt not null;
//   message        : abap.string(0);

contentEquivalent("astabldt", local, server); // [true, null]
```

The comparison runs in linear time (a 1M-character source takes well under a second).

### Other sources compare line by line

ABAP sources (`aclass`, `asprog`, `asinc`, `asfugr`, `asfinc`, `asfunc`) and CDS views, access controls, behavior and service definitions (`asddls`, `asdcls`, `asbdef`, `srvd`) ignore only a BOM, CRLF or CR vs LF, trailing spaces and tabs on a line and trailing blank lines, which SAP changes when it stores and returns a source. Everything else, indentation included, is compared exactly; in ABAP spacing is significant (`a-b` vs `a - b`, `foo( x )` vs `foo(x)`).

Function modules keep one tolerance. ADT generates the `FUNCTION` statement (the signature) on read from the module's parameters, in its own layout. For example, `RFC_READ_TABLE` reads back as `function rfc_read_table\r\n  importing\r\n    value(query_table) like dd02l-tabname …`. Whitespace in that statement is ignored, unless it contains a literal (`DEFAULT 'X'`) or a comment (`"`, or `*` in column 1); then it is compared strictly. SAP also stores two extra blank lines between the signature and the body, so blank lines there (any number, including none) are ignored. The body is compared line by line, and blank lines inside it still count.

### `gitDiff()` shows what `upsert()` would save

`gitDiff()` returns an empty `diffs` array when `contentEquivalent()` says the sources are equivalent, for every type. Otherwise it diffs the lines as `upsert()` normalizes them. Catalyst-CLI's `adt diff` then shows a just-deployed table as identical instead of listing SAP's re-layout, and never shows a hunk that `adt write` would not save.

## Technical Details

- **Changed** `src/core/utils/content.ts`:
  - New `normalizeCdsContent(content, backslashEscapes?)`, a small linear-time tokenizer for literals, comments and separators that also drops one `(0)` after `abap.string` / `abap.rawstring`.
  - New `normalizeSourceLines()` (line ends, trailing spaces and tabs, trailing blank lines).
  - `normalizeContent()` collapses ASCII whitespace only; it is still used for the AFF JSON fallback and function module signatures.
  - The new functions are exported from the `core/utils` barrel only.
- **New** `src/core/adt/functionGroup/moduleSourcesEquivalent.ts`: the function module rule.
- **Changed** `src/core/adt/types.ts`: `ObjectConfig.cdsSource`, set on `astabldt` and `astablds`.
- **Changed** `src/core/adt/craud/contentEquivalent.ts`: AFF JSON, then forms, then tables and structures (both backslash readings), then function modules, then everything else line by line.
- **Changed** `src/core/adt/craud/gitDiff.ts`: no hunks when `contentEquivalent()` says equal; otherwise a diff of the normalized lines (linear, replacing a backtracking trailing-newline regex). Read errors are passed through.
- **Changed** `src/core/forms/formHandler.ts`: a server-side parse error in `equivalent()` is prefixed `server content: `.
- **Docs:**
  - `docs/endpoints/objects.md` says when `unchanged` is reported for each type family.
  - `docs/endpoints/diff.md` says when `diffs` is empty; it was also reformatted with Prettier.
  - `docs/sap-adt.md` covers table re-layout on activation, `abap.string(0)`, and ADT's generated function module signature.
- **Tests:** new unit tests for:
  - `normalizeCdsContent()`: the table example, literals, real token changes, operators, comments, `abap.string(0)` (boundary, one drop, longer names), ASCII-only whitespace, line-bounded literals and linear time.
  - `normalizeSourceLines()` and `normalizeContent()`: ASCII-only whitespace.
  - `contentEquivalent()`: tables and structures, line-by-line CDS views and definitions, both backslash readings, ABAP false equivalents, the function module signature and the blank lines SAP stores after it, and form server errors.
  - `gitDiff()`: a layout-only table difference, ABAP trailing blanks and a bare CR give no hunks. A real change, an ABAP indentation change and a CDS view formatting change give hunks. A function module signature layout and the blank lines after it give none, and read errors pass through.
  - Integration tests: `ddic-workflow` expects the created function group as `asfugr` (as v0.9.0 reports it), and `abap-class-workflow` gives the class create a 30 s timeout.
  - 576 unit tests pass and `bun run typecheck` is clean.

## Verification

The integration suites were run on Madiba-Media-Demo. That run found the blank lines SAP stores after a function module signature, a stale `fugr` expectation in `ddic-workflow`, and a too-short timeout in `abap-class-workflow`, all fixed above. The rerun passed every suite: upsert 8, function-group 6, ddic 8, msag 9, abap-class 9, abap-program 5, table 7, structure 2. A `--dry-run` of 125 deployed S4-Views objects through Catalyst-CLI planned `unchanged` for all but two real differences. The function module signature layout was confirmed by reading `RFC_READ_TABLE` on the same system.

## Commits Included

- 780619a - [UPDATE] Source compare: tables/structures ignore SAP's re-layout, ABAP compares line by line (function module signature layout tolerated); gitDiff agrees with upsert
