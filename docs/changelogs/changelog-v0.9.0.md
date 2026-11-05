# Changelog - v0.9.0

## Release Date

November 5, 2026

## Overview

Relay can now create, read, update, diff, activate and delete message classes (`.asmsag`), lock objects (`.asenqu`), number range objects (`.asnrob`), function groups (`.asfugr`) and their includes (`.asfinc`). New client methods read and write text elements, object titles and program authorization groups, and run ABAP Unit tests. Activation no longer reports success for objects that were not activated or don't exist, deletes always release their lock, and a request on an expired session context is retried once on a new context.

## Breaking Changes

None of the existing method signatures change. Callers will notice these differences:

- **`ConfiguredExtension` widens** to include `'asmsag' | 'asfugr' | 'asfinc' | 'asenqu' | 'asnrob'`, and `ObjectTypeLabel` gains matching members. Code that switches exhaustively over either must handle the new values to typecheck.
- **Discovery returns the new types.** `getTree()` lists message classes, function groups, function group includes, lock objects and number range objects under `objects` (they used to land in `unsupportedObjects`), and `search()` and `whereUsed()` return them instead of dropping them.
- **Function groups created by `upsert()` are reported as `asfugr`.** A group created as the container of a function module or include used to come back as `{ extension: 'fugr', status: 'created' }`. It is now `{ extension: 'asfugr', status: 'created' }`.
- **`DeleteResult.status` can be `'not_found'`.** `delete()` looks up each object first (one extra GET per object). A missing object is reported `not_found` with the message `<Label> <NAME> does not exist`, and no request is sent to delete it. Before, SAP's own answer came back: success for a missing message class, a package error for a missing CDS view.
- **`delete()` always releases the lock.** It used to unlock only when the delete failed. SAP keeps the lock of some deleted types (CDS views, access controls, message classes) in the session, which blocked re-creating the name. A failed unlock after a successful delete doesn't undo the delete; the result is still `success`.
- **`delete()` rolls function group parts up into their group.** Includes and function modules passed together with their function group are not deleted on their own. Their results follow the group's and come after the other results: `success` with `Deleted with function group X`, `not_found`, or `error` with `Not deleted: function group X failed: …`.
- **`activate()` reports objects that were not activated.**
  - SAP says nothing about an object that doesn't exist, just as for one that is already active. Relay now looks up every object SAP was silent about (one extra GET each). A missing object is an `error` with `<Label> <NAME> does not exist`.
  - When SAP cancels a run because one object failed, nothing in the run is activated, yet only the failing object has messages. Relay now reports every object that is still inactive as an `error` ("Not activated: SAP cancelled the activation run because another object in it failed").
- **`activate()` can return more results than objects passed.** Activating a function group adds its inactive includes and function modules, and activating a function group include adds its group. The added objects' results come after the requested ones. Requested objects keep their input order.
- **Message classes are not sent for activation.** They are saved active, so `activate()` returns `success` for them with one `info` message ("No activation needed"). A call with only message classes sends no request.
- **Creates without a description use the object name.** `create()` and `upsert()` used to send an empty description when `ObjectContent.description` was missing. Now they send the upper-case object name, because SAP refuses some creates (includes, tables) without one. Number range objects fall back to the JSON's `header.description` before the name.
- **Stateless requests no longer end the stateful session context.** A request marked `X-sap-adt-sessiontype: stateless` (freestyle queries, package create, ...) that carries the `sap-contextid` cookie ends that context in SAP and releases every lock it holds. Relay now sends stateless requests without that cookie, so they run in a short-lived context of their own.
- **`Dependency` has a new optional `uri` field.** Code that compares `whereUsed()` results by deep equality will see it.
- **A 406 or 415 for an unknown media type has a new error text:** `…: not supported on this SAP release — it does not accept <type> (HTTP 406)`. A 406 that carries another SAP message keeps that message.
- **For contributors:** `bun test`, `bun run test` and `bun run test:unit` run the unit tests only. Integration tests run with `bun run test:integration`. The SSO tests moved from the unit set to `sso-workflow.test.ts` in the integration set.

## What's New

### Message classes (`.asmsag`)

A message class (SE91) is a JSON source. Relay translates it to and from SAP's XML document.

```json
{
  "description": "Sales order messages",
  "messages": [
    { "number": "001", "text": "Order &1 not found", "selfExplanatory": true },
    { "number": 2, "text": "Order &1 is locked by &2" }
  ]
}
```

```typescript
await client.upsert(
  [{ name: "ZSALES", extension: "asmsag", content: messageClassSource }],
  "ZSALES",
  "DEVK900123",
);
```

- **Format:** numbers can be integers or digit strings and are padded to three digits. `selfExplanatory` defaults to `true`. Unknown keys are an error. `read()` returns canonical JSON with one message per line, sorted by number.
- **Whole-replace semantics:** the file describes the complete class. Messages missing from it are deleted, new ones are created, changed ones are updated.
- **Two PUTs:** SAP skips self-explanatory changes in a PUT that also creates messages. Relay sends description changes, updates and deletes in a first PUT and creates in a second. If the second fails, the error says what was saved: `Message Class X was partially updated: saved description, changed and deleted messages; not saved: new messages 004 (…)`.
- **Description:** required to create a class. SAP can hold a class without one, which reads back as `"description": ""`; writing that back is accepted while the server's description is empty too. An existing description can't be cleared.
- **Validation** runs before anything is sent: numbers `000`–`999`, no duplicates, texts non-empty and at most 73 characters, description at most 60 characters.
- **Create** is sent stateless (a stateful create leaves the class enqueued for the session), then the messages are written by lock → PUT → unlock.

### Lock objects (`.asenqu`)

A lock object (SE11) is written in the same DSL style as data elements and domains:

```text
@EndUserText.label: 'Lock sales order'
define lock object ezsales_order {
  primary table : zsales_order lock mode E;
  lock parameters {
    mandt    : zsales_order.mandt;
    order_id : zsales_order.order_id;
  }
}
```

- Secondary tables (`secondary table : <table> lock mode <mode>;`), `@AllowRFC: true` and `not wanted` parameters are supported. Lock modes are `E`, `S` and `X`; a server document with any other mode is an error rather than being read as `E`.
- **Validation:** the name starts with `E` (or `/NS/E`) and has at most 16 characters, a description of at most 60 characters is required, there is at least one parameter, and each parameter's table is the primary or a secondary table. A table that doesn't exist only fails at activation.
- **Create:** SAP's create stores every parameter as not wanted, so Relay fills the lock object by lock → PUT → unlock right after the create. If that step fails, the lock object exists as an empty shell and the next `upsert()` updates it.
- **Delete with its table:** activation generates `ENQUEUE_`/`DEQUEUE_<name>` modules that show up in the table's where-used list. When the lock object is deleted in the same call, those hits no longer block the table. Another lock object on the same table still blocks it.

### Number range objects (`.asnrob`)

The content of a number range object (SNRO) is SAP's abap-file-formats JSON (`nrob-v1`), read and written as is at `/source/main`.

- `upsert()` compares local and server JSON as values: key order, `10` vs `10.0`, whitespace and a BOM don't count as changes.
- `header.description` is only taken on create.
- `"rolling": true` stores TNRO-NONRSWAP = `X`, which means "no rolling", the opposite of the schema's wording.
- Intervals are not part of ADT. A delete fails while the object has intervals.

### Function groups (`.asfugr`) and their includes (`.asfinc`)

A function group's content is its main program `SAPL<group>`. Its includes (`L<group>xxx`) and function modules are separate files.

```typescript
await client.upsert(
  [
    {
      name: "ZSALES",
      extension: "asfugr",
      content: mainProgram,
      description: "Sales functions",
    },
    { name: "LZSALESTOP", extension: "asfinc", content: topInclude },
    { name: "LZSALESF01", extension: "asfinc", content: formsInclude },
    {
      name: "Z_SALES_READ",
      extension: "asfunc",
      container: "ZSALES",
      content: moduleSource,
    },
  ],
  "ZSALES",
  "DEVK900123",
);
```

- **Container:** the group of an include comes from its name (`LZSALESF01` → `ZSALES`, `/NS/LFOOTOP` → `/NS/FOO`), so `container` can be left out.
- **Order:** `upsert()` writes includes, then the main program (so the file wins over the `INCLUDE` lines SAP appends when an include is created), then function modules, domains, data elements and everything else. A missing group is created first, with the `description` of the batch's `.asfugr` object when there is one, and is reported `created`.
- **Include creates:** an include is created stateless, in a context of its own. In the stateful context, a create after that context activated the group fails with `SAPL<group> not found`, and `SAPL<group>` stays locked until the context ends. Each create locks the whole group while it runs, so `upsert()` writes the includes of one group one at a time. Other groups and objects still run in parallel.
- **Guards:** `L<group>UXX` is generated by SAP and is refused before anything is sent. A failed `.asinc` write whose name looks like a function group include says to save it as `.asfinc`.
- **Activation:** an include is activated together with its group, and a group with its inactive includes and function modules (see Breaking Changes).
- **Delete:** see Breaking Changes. A table's where-used list can include a maintenance function group's generated include. When that group is deleted in the same call, the hit counts as the group, so the group is deleted before the table.
- **`getFunctionGroupParts(group)`** lists a group's own includes and function modules, leaving out includes it shares with other groups (e.g. `LSVIM*`).

### Text elements

Programs, classes and function groups have text pools: text symbols, selection texts and list headings (classes have text symbols only). These methods are library only; there are no HTTP routes.

```typescript
const [owner, ownerErr] =
  await client.resolveTextElementsOwner("ZSALES_REPORT");
if (ownerErr) return;

const [texts] = await client.readTextElements(owner); // { symbols, selections, headings }
await client.writeTextElements(
  owner,
  { symbols: "@MaxLength:20\nT01=Open sales orders\n" },
  "DEVK900123",
);
await client.activateTextElements([owner]);
```

- **Read** returns each part's text as SAP serves it. `parseTextElements()`, `canonicalTextElements()` and `textElementsEquivalent()` turn it into entries or compare two texts regardless of order and line endings. Untexted selections (`=?...`) and empty headings are dropped.
- **Write** replaces every entry of each part it sends. Each part is parsed, validated and re-serialized first, so nothing is sent if any part is invalid. Validation catches what SAP would answer with an unexplained 406: a symbol without `@MaxLength`, a text longer than its `@MaxLength`, `@MaxLength` over 132, keys longer than 3 characters, selection names longer than 8 characters, duplicate keys.
- **Activation:** activating the owner doesn't activate its texts, and SAP's background activation run reports success but leaves the texts inactive. `activateTextElements()` uses SAP's synchronous activation instead. Results carry the extension `textelements`.
- **`resolveTextElementsOwner(name)`** tries a program, then a class, then a function group. When a program and a class share the name, the program wins.

### Object titles and program authorization groups

`readObjectAttributes()` and `writeObjectAttributes()` read and write an object's title, and a program's authorization group. Both live in the object's metadata document, not its source. Supported types are programs, includes, classes, function groups and function group includes (`ATTRIBUTE_EXTENSIONS`).

```typescript
const [result] = await client.writeObjectAttributes(
  { name: "ZSALES_REPORT", extension: "asprog" },
  { title: "Open sales orders", authorizationGroup: "ZSALES" },
  "DEVK900123",
);
// result.changed: ['title', 'authorizationGroup']
```

- Only attributes that differ from SAP's are written. `changed` is empty when there was nothing to do.
- The change is saved inactive; activate the object afterwards.
- The title can't be empty or longer than SAP's limit (70 for programs and includes, 60 for classes, 40 for function groups); `readObjectAttributes()` returns the limit as `titleMaxLength`.
- An authorization group that isn't registered in TPGP is stored by SAP anyway. Relay returns a warning in `warnings`.

### ABAP Unit

`runUnitTests()` runs the tests of objects and/or packages (subpackages included) and returns each program's test classes and methods with their alerts, plus a summary.

```typescript
const [run, runErr] = await client.runUnitTests({
  packages: ["ZSALES"],
  objects: [{ name: "ZCL_SALES_ORDER", extension: "aclass" }],
});
if (run && !run.summary.success) {
  console.log(
    run.summary.failed,
    run.summary.errors,
    run.summary.objectsWithoutResults,
  );
}
```

- Risk levels and durations default to ADT's own (`harmless`, `dangerous`; `short`, `medium`). The run is synchronous, so the default timeout is 10 minutes (`timeout` overrides it).
- Each method is `passed`, `failed` (failed assertion) or `error` (exception). Alerts carry the title, details and stack with line and column.
- `summary.success` is true only when no assertion failed and no exception occurred, at least one method ran (`methodsRun > 0`) and no program has syntax errors.
- `summary.objectsWithoutResults` lists requested objects SAP returned nothing for: SAP answers a missing object and one without test classes the same way. Packages are not checked.
- `getUnitTestMetadata()` returns the client's highest allowed risk level and whether the client or the user may not run tests.

### Activation, delete and session fixes

- **Activation:** see Breaking Changes for cancelled runs, missing objects, function group parts and message classes.
- **Delete:** see Breaking Changes for `not_found`, lock release and function group parts. An object that turns out not to exist unblocks the objects that reference it, like a successful delete.
- **Expired session context (`ICMENOSESSION`):** when SAP no longer knows the session context (timed out, or ended by another logoff), it rejects the request with HTTP 400 before running anything. Relay now drops the dead context cookie and retries once on a new context. If the retry is rejected too, the error says the session expired and to log in again. Locks held by the old context are gone.
- **Locks on create and update:** `create()` and `update()` now unlock on every path. If both the write and the unlock fail, the error names both.

### Smaller fixes

- **Search limit:** `search(query, { maxResults })` passes the limit to SAP (positive integer, default `10001`). It used to always ask for 10001 results, so a wide pattern took minutes even when the caller wanted ten.
- **Long SQL lines:** SAP cuts data preview and freestyle query bodies into 255-character lines, splitting tokens ("Boolean expression expected"). `previewData()` and `freestyleQuery()` now break longer lines at whitespace, never inside a `'…'` or `` `…` `` literal; a broken `"` comment continues as a comment.
- **Byte order marks:** a leading UTF-8 BOM in source content is ignored by every parse and comparison and is never sent to SAP.
- **`gitDiff()`:** CRLF vs LF line endings and trailing newlines no longer show as changes.

### New exports

All new parameter and result types are importable from `'catalyst-relay'`. The new runtime exports are:

| Export                                                                                                                                                                                             | Purpose                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `OBJECT_CONFIG_MAP`, `getConfigByExtension`, `getConfigByType`, `ATTRIBUTE_EXTENSIONS`                                                                                                             | Object type registry (extension ↔ ADT type, `kind`, `sourceFormat`, `hasAttributes`) |
| `containerFromIncludeName`, `containerFromUri`, `groupFromUri`, `isGeneratedInclude`                                                                                                               | Function group names and URIs                                                        |
| `contentEquivalent`                                                                                                                                                                                | Compare local and server source the way `upsert()` decides `unchanged`               |
| `stripBom`                                                                                                                                                                                         | Drop a leading UTF-8 BOM                                                             |
| `parseMessageClass`, `validateMessageClass`, `serializeMessageClass`, `messageClassesEquivalent`                                                                                                   | `.asmsag` helpers                                                                    |
| `parseLockObject`, `serializeLockObject`, `validateLockObject`, `lockObjectsEquivalent`, `LOCK_MODES`                                                                                              | `.asenqu` helpers                                                                    |
| `parseTextElements`, `serializeTextElements`, `canonicalTextElements`, `textElementsEquivalent`, `validateTextElements`, `textElementsReference`, `TEXT_ELEMENTS_KINDS`, `TEXT_ELEMENTS_EXTENSION` | Text element helpers                                                                 |
| `UNIT_TEST_RISK_LEVELS`, `UNIT_TEST_DURATIONS`, `DEFAULT_UNIT_TEST_RISK_LEVELS`, `DEFAULT_UNIT_TEST_DURATIONS`                                                                                     | ABAP Unit options                                                                    |

All of these are pure; none send requests.

## Technical Details

- **Changed** `src/core/adt/types.ts`: entries for `asmsag`, `asfugr`, `asfinc`, `asenqu` and `asnrob`. `ObjectConfig` gains `statelessCreate`, `populateAfterCreate`, `alwaysActive`, `createContentType`, `sourceFormat` (`'aff-json'`) and `hasAttributes`. New `LockTarget`, `SourceFormat` and `SOURCE_FORMAT_MEDIA_TYPES`.
- **New** `src/core/msag/` and `src/core/enqu/`: pure (no HTTP) parse, validate, serialize, XML build / parse / merge and comparison for message classes and lock objects. The lock object parser reuses the `src/core/ddic` tokenizer.
- **New** `src/core/forms/`: `getFormHandler()` moved here from `src/core/ddic` and covers all four form types. Handlers now return a list of PUT bodies (`updateBodies`) instead of one merged document, and `declaredName()` may return `null` (message classes take their name from the file).
- **New** `src/core/adt/functionGroup/`: every function group rule (include names, `ensureFunctionGroup()` moved from `craud/`, `prepareFunctionGroups()`, upsert order, `oneAtATimePerGroup()`, delete roll-up and where-used mapping, `withFunctionGroupParts()` for activation).
- **New** `src/core/adt/textelements/`, `src/core/adt/attributes/`, `src/core/adt/abapunit/`, `src/core/adt/aff/` (`affJsonDescription()`, `affJsonEquivalent()`), `src/core/adt/discovery/functionGroupParts.ts`, with client methods in `src/client/methods/{textelements,attributes,abapunit}/`.
- **New** `src/core/adt/craud/withLock.ts` (lock → work → unlock on every path), `objectExists.ts` and `contentEquivalent.ts`. `lock.ts` gains `acquireLock()` / `releaseLock()` for any lockable URI. These and `objectLockTarget()` are exported from the `core/adt` barrel only.
- **Changed** `src/core/adt/craud/activation.ts`: reads `chkl:properties` to detect cancelled runs, checks the inactive list (match by URI, else by name and type; `deleted="true"` entries ignored) and looks up silent successes.
- **Changed** `src/core/adt/craud/multiDelete.ts`: existence check, unconditional unlock, `not_found`, and mapping of lock module and function group part hits.
- **Changed** `src/core/adt/helpers.ts`: `checkResponse()` takes an optional media type and reports a 406/415 for it through `mediaTypeError()`. New `sourceMediaType()` and `objectLockTarget()`. `containerFromUri()` moved to `functionGroup/names.ts` and now also matches include URIs.
- **Changed** `src/client/methods/internal/request.ts`: stateless requests drop the `sap-contextid` cookie; an `ICMENOSESSION` 400 is retried once on a new context.
- **New** `src/core/adt/data_extraction/wrapSqlLines.ts`, used by `previewData()` and `freestyleQuery()`.
- **New** `src/core/utils/bom.ts` (`stripBom()`), `json.ts` (`safeJsonParse()`); `xmlDom.ts` moved from `src/core/ddic` to `src/core/utils` with new `childElements()` / `firstChildElement()`.
- **Server** No route changes. The object routes route by extension, so `/objects/read`, `/objects/upsert`, `/objects/activate` and `DELETE /objects` accept the new extensions. Text elements, object attributes, ABAP Unit and `getFunctionGroupParts` are library-only.
- **Tests** New unit tests for message classes, lock objects, text elements, ABAP Unit, attributes, function groups, activation, delete, upsert, stateless requests, `ICMENOSESSION` recovery, `withLock`, `contentEquivalent`, SQL wrapping, search `maxResults` and BOM handling, with a fake SAP in `src/__tests__/client/fakeSap.ts`. New integration suites `msag-workflow`, `enqu-workflow` and `function-group-workflow`, and a `deleteExisting()` cleanup helper.
- **Fixtures** `.gitignore` ignored every `*.xml`, so the XML fixtures were never committed; it now re-includes `src/__tests__/fixtures/**/*.xml`. `.gitattributes` keeps the CRLF text element fixtures byte-for-byte.
- **Scripts** `bunfig.toml` excludes `src/__tests__/integration` from a bare `bun test`. `package.json` adds `test:unit` and `test:integration` (replacing `test:run`), and `test.bat` uses them.
- **Docs** `docs/sap-adt.md` documents the new types and new sections on text elements, ABAP Unit, activation results and object attributes. `docs/endpoints/objects.md` covers `not_found`, activation of missing objects and the new extensions; `preview.md` the SQL line wrapping; `search.md` `maxResults`; `docs/testing.md` the unit/integration split. `README.md` was reformatted with Prettier.

## Verification

Verified against a live SAP system (on-premise S/4HANA 2023, SAP_BASIS 758): 545 unit tests pass, and the integration suites `msag-workflow`, `enqu-workflow`, `function-group-workflow`, `cds-workflow`, `data-preview` and `search` pass. The function group include fix was also checked in the shape SE54 produces: a maintenance-generated group that then receives new includes ends up with exactly one `INCLUDE` line per include, a clean diff and nothing left inactive. Catalyst-CLI 2.0.0's integration suites cover the remaining new types (text elements, number range objects, ABAP Unit, attributes) through this release.

## Commits Included

- 157de83 - [UPDATE] Message classes, text elements, lock objects, number range objects, function group includes, object attributes and ABAP Unit runs; activation, delete and session fixes; unit/integration test split
