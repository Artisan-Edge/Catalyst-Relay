# SAP ADT Domain Knowledge

SAP-specific concepts and behaviors for working with ADT (ABAP Development Tools).

## Sections

- [CSRF Token Flow](#csrf-token-flow)
- [SSL Verification](#ssl-verification)
- [Form-based objects and function modules](#form-based-objects-and-function-modules)
- [Text elements](#text-elements)
- [ABAP Unit](#abap-unit)
- [Activation results](#activation-results)
- [Object attributes (titles)](#object-attributes-titles)
- [Fiori launchpad sources](#fiori-launchpad-sources)
- [InA service bindings](#ina-service-bindings)
- [Cloud IAM](#cloud-iam)
- [Deletion service](#deletion-service)
- [MDA app generator](#mda-app-generator)
- [Class run](#class-run)

---

## CSRF Token Flow

SAP requires CSRF tokens for state-changing requests:

1. First request sends header `x-csrf-token: fetch`
2. Server returns token in response header
3. All subsequent requests include that token
4. On 403 "CSRF token validation failed" → auto-refresh and retry

---

## SSL Verification

The Python reference disables SSL verification (`verify: False`). This is intentional for SAP systems with self-signed certs.

---

## Form-based objects and function modules

Data elements, domains and message classes have no `/source/main`: the object URI holds a vendor XML document. Relay translates `.asdtel` / `.asdoma` DSL (`src/core/ddic`) and `.asmsag` JSON (`src/core/msag`) to and from it. Captured responses live in `src/__tests__/fixtures/ddic/` and `fixtures/msag/`.

| Type          | Object URI                                            | Media type                                    |
| ------------- | ----------------------------------------------------- | --------------------------------------------- |
| Data element  | `/sap/bc/adt/ddic/dataelements/{name}`                | `application/vnd.sap.adt.dataelements.v2+xml` |
| Domain        | `/sap/bc/adt/ddic/domains/{name}`                     | `application/vnd.sap.adt.domains.v2+xml`      |
| Message class | `/sap/bc/adt/messageclass/{name}`                     | `application/vnd.sap.adt.mc.messageclass+xml` |
| Lock object   | `/sap/bc/adt/ddic/lockobjects/sources/{name}`         | `application/vnd.sap.adt.lockobjects.v1+xml`  |
| Function mod. | `/sap/bc/adt/functions/groups/{group}/fmodules/{fm}`  | source at `{uri}/source/main` (text)          |
| Function grp. | `/sap/bc/adt/functions/groups/{group}`                | main program at `{uri}/source/main` (text)    |
| FUGR include  | `/sap/bc/adt/functions/groups/{group}/includes/{inc}` | source at `{uri}/source/main` (text)          |
| Number range  | `/sap/bc/adt/numberranges/objects/{name}`             | source at `{uri}/source/main` (JSON)          |
| Launchpad     | `/sap/bc/adt/fiori/{uiad,uipgtyp,uisttop}/{name}`     | source at `{uri}/source/main` (JSON)          |

- **Create:** one POST of the full document to the collection (201, inactive). Function groups and modules: POST a shell with `Content-Type: application/*`; a module carries `adtcore:containerRef` instead of `packageRef`.
- **Update / delete:** lock `{objectUri}?_action=LOCK`, then PUT (vendor type) or DELETE `{objectUri}?lockHandle=…`. Function modules lock the object URI and PUT the source URI.
- **Read:** GET returns the inactive version when one exists. A PUT of a GET body is accepted; unmodelled fields survive.
- **Sources from files:** a leading UTF-8 BOM is ignored by every parse (JSON, DSL, text elements) and comparison, and never sent to SAP (`stripBom`).
- **Unsupported media types:** a release that doesn't know a vendor type answers 406 (`ExceptionResourceNotAcceptable`) or 415. Relay reports it as `…: not supported on this SAP release — it does not accept <type> (HTTP 406)`. A 406 with another SAP message (e.g. invalid text elements) keeps that message.
- **Derived values:** output length `000000` and label field lengths `0` are filled in by SAP on activation.
- **Activation:** activating new function modules also activates their new group. A domain whose conversion routine doesn't exist fails activation ("Conversion routine X does not exist").
- **Check runs:** `checkObject` without artifacts works, but several DDIC objects in one run repeat each other's messages, so check them one per run.
- **Type codes:** ADT's `dataType` is the uppercase CDS kind (`CHAR`, `NUMC`, `DEC`, `STRING`, `RAWSTRING`, `SSTRING`), not the DD01L codes (`STRG`, `RSTR`, `SSTR` are silently dropped).
- **Message classes (MSAG/N):** saved active; activation returns a warning ("Activation/Generation tool … not found"), so relay skips it.
  - Create: POST the class without messages (they are ignored), stateless — a stateful create leaves the class enqueued for that session. Messages are added by a PUT afterwards.
  - PUT merges: new `<mc:messages mc:msgno mc:msgtext mc:selfexplainatory>` are created; existing ones update only when the text changed or `mc:lockhandle` is set; omitted ones stay. `<mc:deletedmessages mc:msgno="…"/>` deletes. Numbers must be numeric, texts non-empty.
  - A PUT that creates messages skips self-explanatory changes on updated ones, so relay sends updates/deletes and creates as two PUTs (`CL_ADT_MC_RES_CONTROLLER->do_update`).
  - DELETE keeps the class lock in the session; relay unlocks afterwards so the name can be re-created (a failed unlock does not undo the delete).
  - A class can be stored without a description (the GET root has no `adtcore:description`; ZSNAP_C2T on Madiba-Media-Demo, also blank in quick search). It reads back as `"description": ""`; writing that back is accepted while the server's is empty too. Creating a class, or clearing an existing description, still needs one.
  - If the second PUT (creates) fails after the first succeeded, the error says `… was partially updated: saved description, changed and deleted messages; not saved: new messages 004 (…)`. The class is unlocked on every path.
  - `/messageclass/{name}/messages/{no}` (lock/GET/DELETE) is not usable: GET returns an empty message, DELETE rejects its own lock handle.
- **Function groups (FUGR/F, `asfugr`) and their includes (FUGR/I, `asfinc`):**
  - The group's content is its main program `SAPL<group>` (`{group}/source/main`; lock the group URI). `/programs/programs/sapl…` does not work. Creating a group adds TOP and UXX.
  - Include create: POST `finclude:abapFunctionGroupInclude` (`xmlns:finclude="http://www.sap.com/adt/functions/fincludes"`, type FUGR/I, `containerRef` to the group, no `packageRef`) to `{group}/includes` with Content-Type exactly `application/vnd.sap.adt.functions.fincludes.v2+xml` (the unversioned type is 415). SAP appends `INCLUDE l<group>xxx.` to the main program (inactive). Locking the include or its `/source/main` gives the same handle.
  - Relay sends the include create stateless, in a context of its own (no `sap-contextid` cookie). In the stateful context, a create after that context created an include and then activated the group fails with `SAPL<group> not found` (ED 168): the include is created anyway, the INCLUDE line is not added, and `SAPL<group>` stays enqueued for that context ("User X is currently editing SAPL…") until it ends. Each create enqueues `SAPL<group>` for its request, so another create or a lock on a sibling include at the same time fails ("Editing canceled", "Object <group> is already being edited"); upsert writes the includes of one group one at a time (`oneAtATimePerGroup`). A create while the session holds the `SAPL<group>` lock is refused.
  - Include delete comments out the INCLUDE line and leaves the main program inactive; where-used reports the group as a user, which relay ignores. `/programs/includes/l…` can read these includes but not lock or write them.
  - Deleting a group deletes its includes and modules; parts passed in the same call follow the group's result (`Deleted with function group X`, or `Not deleted: function group X failed: <group's error>`).
  - A table's where-used can list a maintenance group's generated include (e.g. `LZCAT_FGT00`) or its modules. When that group is deleted in the same call, relay maps such hits (by URI, `L<group>xxx` or `SAPL<group>` name) to the group, so the group is deleted before the table.
  - `L<group>UXX` is generated from the group's modules and cannot be written (`isGeneratedInclude`).
  - All of these rules live in `src/core/adt/functionGroup/`.
  - Activating the group alone leaves a new include inactive, so relay activates an include together with its group, and a group with its inactive includes. The inactive list shows an inactive main program as FUGR/I `{group}/source/main` named `SAPL<group>`.
  - The include name gives the group (`L<group><3 chars>`, `/NS/L<group>xxx`). `POST /repository/nodestructure?parent_type=FUGR/F&parent_name=<G>` lists the group's parts plus shared ones (e.g. `LSVIM*` of maintenance groups under `/groups/svim/`); `getFunctionGroupParts` keeps the group's own. An unknown group answers 200 with an empty body.
- **Lock objects (ENQU/DL, `asenqu`):** content `enqu:allowRFC`, `primaryTable`, `secondaryTables`, `lockParameters` (`parameterWanted`, `parameterName`, `tableName`, `fieldName`), read-only `lockModules`. The create POST stores every parameter as not wanted, so relay fills the object by lock → PUT → unlock afterwards. A PUT without `lockParameters` sets every key field to not wanted: always send them in full. Activation generates `ENQUEUE_`/`DEQUEUE_<name>` in `/1BCDWBEN/…`; a table's where-used lists them. A lock module of a lock object deleted in the same call stands for that lock object; the `/1BCDWBEN/` group hit is ignored only when every lock module hit belongs to a lock object in the call (another lock object on the table still blocks the delete). Lock modes: `GET /ddic/lockobjects/lockmodes`; a mode other than E, S or X in a document is an error rather than silently becoming E. A missing table fails only at activation.
- **Number range objects (NROB/NRO, `asnrob`):** create POSTs `blue:blueSource` with `Content-Type: application/vnd.sap.adt.blues.v1+xml`; content is abap-file-formats JSON (`nrob-v1`) at `/source/main` (`application/json`, lock the object URI). `header.description` is only taken on create. Upsert compares local and server JSON as values (key order, `10` vs `10.0`, whitespace and a BOM are no change; `ObjectConfig.sourceFormat: 'aff-json'`). `"rolling": true` stores TNRO-NONRSWAP = `X` ("no rolling"), the opposite of the schema's wording. Intervals are not in ADT, and DELETE fails while intervals exist.
- **Tables and structures (`astabldt`, `astablds`):** their DDL is rebuilt from the DDIC on activation (`label : 'x'`, aligned `key a      : t`, blank lines after `{`). Upsert ignores whitespace next to `: ; , . { } ( ) [ ] = < >` and keeps quoted literals exact (`ObjectConfig.cdsSource`; `normalizeCdsContent`). `abap.string` / `abap.rawstring` are stored as `abap.string(0)` / `abap.rawstring(0)` (ZCATALYST_RUN on Madiba-Media-Demo reads back `message : abap.string(0);`), so upsert ignores one `(0)` after them in code (not in literals or comments; type name case-insensitive); `abap.string(256)` stays a change. Whether a backslash escapes a quote in a CDS literal is unknown, so a pair with a backslash must match under both readings. `gitDiff` shows no hunks when they are equivalent.
- **CDS views, access controls, behavior and service definitions (`asddls`, `asdcls`, `asbdef`, `srvd`):** SAP keeps the source as written, so they are compared like ABAP and a formatting-only edit is uploaded and shown by `gitDiff`.
- **ABAP sources:** compared line by line; SAP returns CRLF and drops trailing blanks, which are ignored (`normalizeSourceLines`). A function module's `FUNCTION` statement is generated by ADT on read from the parameters, in its own layout (e.g. `function rfc_read_table\r\n  importing\r\n    value(query_table) like dd02l-tabname …`), so whitespace there is ignored unless it holds a literal or a comment (`"`, or `*` in column 1) (`moduleSourcesEquivalent`). SAP stores two extra blank lines between the signature and the body, so blank lines there are ignored. `gitDiff` diffs the normalized lines, so it shows exactly the changes upsert would save.
- **Whitespace** in these comparisons is ASCII only (space, tab, CR, LF, FF, VT); NBSP, a BOM after the first character, U+2028 and U+3000 are content.
- **Stateless requests:** `X-sap-adt-sessiontype: stateless` on the stateful context ends that context, releasing every lock it holds. Relay therefore sends stateless requests without the `sap-contextid` cookie, so they run in a short-lived context of their own (same security session) and the stateful context keeps its locks.
- **ABAP Cloud:** objects inherit `cloudDevelopment` from a development package, so no attribute is sent. `$TMP` can't hold them (403 `S_ABPLNGVS`, or activation fails with an explicit version). Verified in a Cloud package: function groups, function modules, domains with conversion routines, data elements.

---

## Text elements

A program's, class's or function group's text pool (SE38 text elements). Library only: `client.readTextElements`, `writeTextElements`, `resolveTextElementsOwner`, `activateTextElements`; pure helpers `parseTextElements`, `serializeTextElements`, `canonicalTextElements`, `textElementsEquivalent`, `validateTextElements`.

| Owner          | Pool URI                                      | ADT type   | Parts                               |
| -------------- | --------------------------------------------- | ---------- | ----------------------------------- |
| Program        | `/sap/bc/adt/textelements/programs/{name}`    | `PROG/PX`  | `symbols`, `selections`, `headings` |
| Class          | `/sap/bc/adt/textelements/classes/{name}`     | `CLAS/OCX` | `symbols`                           |
| Function group | `/sap/bc/adt/textelements/functiongroups/{n}` | `FUGR/PX`  | `symbols`, `selections`, `headings` |

- **Parts:** `{poolUri}/source/{part}`, media type `application/vnd.sap.adt.textelements.{part}.v1` (Accept it exactly; `text/plain` is answered 406 although the PUT lands). Metadata: `application/vnd.sap.adt.textelements.v1+xml`. No create or delete.
- **Format:** symbols `@MaxLength:N` + `KEY=text`; selections `NAME    =text`, `@DDICReference` before a DDIC-sourced one; headings `listHeader=` and `columnHeader_1..4=`. Blocks separated by a blank line, CRLF. SAP sorts the entries; compare as sets.
- **Read:** an untexted selection reads `NAME    =?...`; empty headings come back as `key=`. Parsing drops both. Reads give the master language. Without `version`, a session that wrote an inactive version gets it back; other sessions get the active one.
- **Write:** lock the pool URI (`_action=LOCK&accessMode=MODIFY`), PUT each part (`lockHandle`, `corrNr`), unlock. A PUT replaces all entries of its part. Missing `@MaxLength` or a text over it is a 406 DS512, so `validateTextElements` checks first. Unknown selection names are accepted silently. Works on a program that is still inactive.
- **Activation:** the pool activates on its own reference (activating the owner does not). The background run (`/activation/runs`) reports success but leaves the pool inactive, so `activateTextElements` uses the synchronous `POST /sap/bc/adt/activation?method=activate&preauditRequested=true`. `activationExecuted="false"` without messages means nothing was inactive.
- **Inactive list:** an inactive pool does not appear in `/activation/inactiveobjects`.

---

## ABAP Unit

`client.runUnitTests({ objects?, packages?, riskLevels?, durations?, timeout? })` returns `{ programs, summary }`; `client.getUnitTestMetadata()` returns the client's `maxRiskLevel` and whether runs are denied.

- **Run:** `POST /sap/bc/adt/abapunit/testruns`, `Content-Type: application/vnd.sap.adt.abapunit.testruns.config.v4+xml`, Accept exactly `application/vnd.sap.adt.abapunit.testruns.result.v2+xml`. Synchronous; package `ZSNAP` (92 methods) takes ~7–12 s, so the default timeout is 10 minutes.
- **Request:** `objectSets/objectSet kind="inclusive"` with object URIs or `/sap/bc/adt/packages/{pkg}` (subpackages included). Defaults as ADT: risk `harmless,dangerous`, durations `short,medium`.
- **Result:** always HTTP 200. `runResult > program > testClasses/testClass > testMethods/testMethod` (`executionTime` in s). No `<alerts>` is a pass. `kind="failedAssertion"` / `"exception"` carry `title`, nested `details/detail@text` and `stack/stackEntry` (`#start=line,col`). A class-level `kind="warning"` means not executed (risk or duration above the limit). A program-level warning with `aunit:hasSyntaxErrors="true"` means it does not compile.
- **Missing objects:** a nonexistent object and one without test classes both answer an empty `<aunit:runResult/>`; relay lists such requested objects in `summary.objectsWithoutResults` (packages are not checked).
- **Summary:** `methodsRun` (also `methods`), `passed`, `failed`, `errors`, `skippedClasses`, `syntaxErrors`, `failingAlerts`, `objectsWithoutResults`, `executionTime`. `success` is true only when no assertion failed or exception occurred, at least one method ran, and no program has syntax errors (previously an empty run or a syntax error still counted as success).
- **Metadata:** `GET /sap/bc/adt/abapunit/metadata`, Accept `application/vnd.sap.adt.abapunit.metadata.result.v1+xml`; `clientSetup@maxRiskLevel`, `clientSetup@executionDenied`, `userAuthorization@executionDenied`.

---

## Activation results

`GET /activation/results/{run}` starts with `<chkl:properties checkExecuted activationExecuted generationExecuted>`.

- `checkExecuted="true" activationExecuted="false"`: SAP cancelled the run (an object in it failed); nothing was activated, yet only the failing object has messages. Relay re-reads the inactive list and reports every object still inactive as an error ("Not activated: SAP cancelled the activation run…"); if the list can't be read, every object without its own error is reported failed.
- `checkExecuted="false" activationExecuted="false"`: nothing to do (already active); reported as success.
- The inactive-list match is by URI, else by name and type (an include or main program can be listed under `{uri}/source/main`); `deleted="true"` entries don't count.
- Results come back in input order; types saved active (message classes) get an info result in their place and are not sent (a call with only message classes sends nothing).
- A metadata-only change (program title, authorization group) activates through the run endpoint like any other change.

---

## Object attributes (titles)

`readObjectAttributes` / `writeObjectAttributes` (types with `ObjectConfig.hasAttributes`: `asprog`, `asinc`, `aclass`, `asfugr`, `asfinc`): the title is the root `adtcore:description` of the object's metadata document (GET `{objectUri}` with `Accept: application/*`), a program's authorization group is `<program:authorizationGroup><program:ref adtcore:name="…"/></program:authorizationGroup>`.

- Write: lock the object URI → PUT the edited document with the media type it was served with → unlock (always). Only differing attributes are written. The document is edited through the DOM by namespace, so any prefix or a self-closing root works; a document without the expected root or `adtcore:description` is an error.
- Saved inactive. Class (SEOCLASSTX) and function group (TLIBT) titles are stored at once; program/include titles (TRDIRT) and TRDIR-SECU change on activation.
- `adtcore:descriptionTextLimit` gives the title limit (70 programs/includes, 60 classes, 40 function groups).
- SAP stores an authorization group that is not in TPGP without complaint; relay checks `{program}/valuehelp/authorizationgroup?name=…` and returns a warning.

---

## Fiori launchpad sources

App descriptor items (UIAD/TYP, `asuiad`), page templates (UIPG/TYP, `asuipg`) and space templates (UIST/TOP, `asuist`). Verified on Madiba-Cloud-Dev (ABAP Cloud, package `ZSNAP_BC`).

| Type | Collection                  | Saved    |
| ---- | --------------------------- | -------- |
| UIAD | `/sap/bc/adt/fiori/uiad`    | active   |
| UIPG | `/sap/bc/adt/fiori/uipgtyp` | inactive |
| UIST | `/sap/bc/adt/fiori/uisttop` | inactive |

- **Create:** POST `blue:blueSource` with `Content-Type: application/vnd.sap.adt.blues.v2+xml` (NROB uses v1). The description is `header.description`, else `generalInformation.title`, else the name.
- **Content:** abap-file-formats JSON at `{uri}/source/main` (`application/json`; lock the object URI, `corrNr` outside `$TMP`).
- **Header:** SAP always returns `header` (`description`, `originalLanguage`, `abapLanguageVersion`). A PUT without `header` stores `description: ""`; a space PUT without `header.description` and `header.originalLanguage` is a 500 (dump). So every launchpad type (and SIAD) requires both, non-empty (`AffJsonRules.requiredPaths`).
- **Refused up front:** an empty source, one that is not a JSON object, or one missing a required path is refused before any request: `upsert` checks the whole batch before its first wave, `update` before the lock (`refuseInvalidAffSource(object)`; `requireAffJsonPaths(content, getConfigByExtension(ext)?.affJson, label)` is the same check without HTTP).
- **Compare normalisation:** `header.abapLanguageVersion` is SAP's (ignored), `header.originalLanguage` compares ignoring case, `formatVersion` compares as a string. A local source that is not JSON, or that a write would refuse (required path missing, empty or blank), never compares as unchanged.
- **Dropped values:** SAP stores every `false` boolean as absent (`desktop`, `phone`, `isDefault`, …), and on pages drops `visualizations[].type` / `displayFormat` when they are `ladiAssignment` / `standard`. The page schema also defaults `tileAssignment.tileKey.catalogType` and `targetMappingKey.catalogType` to `standard`. Upsert treats all of these as no change (`ObjectConfig.affJson`: `serverOmitsFalse`, `serverDefaults`). Empty strings and other defaults (`appType: "ui5"`, `tileType: "static"`) are kept.
- **Activation:** UIAD is skipped (`alwaysActive`). Pages and spaces go through the activation run; a space without `generalInformation.sortPriority` may warn (`/UI2/UIST_CHECK` 111), which counts as success. A space whose title is empty fails ("Space template title is initial").
- **Order:** upsert writes them after every other type, items before pages before spaces (a space references pages, a page references items).
- **Move:** not supported (`ObjectConfig.moveUnsupported`).

---

## InA service bindings

`createServiceBinding({ bindingType: 'INA', … })` creates an InA (analytical query) binding: `<srvb:binding srvb:category="0" srvb:type="INA">` without `srvb:version` or `bindingTypeData`.

- **Options:** always a UI binding. `bindingVersion`, `bindingCategory: 'WEB_API'` and `publish: true` are rejected.
- **Validation:** `serviceBindingVersion=INA`. `INA\V4` dumps (500).
- **Activation** creates the `INA1/INA` runtime object; nothing else is needed.
- **Re-activation:** `client.activate` cannot address a binding (SRVB has no extension); `activateServiceBinding(name)` re-activates it, e.g. after its service definition was widened.
- **Never published:** `odatav4/publishjobs` on an InA binding dumps (500) and ends the stateful session. The binding reads back `published="false"` with `allowedAction="PUBLISH"` even when complete, so a re-run skips publish.
- **Read:** `bindingType: 'INA'`, `category: 'UI'`, `odataVersion: ''`. A re-run compares the binding type, not the OData version.
- **Delete:** `deleteServiceBinding` reads the binding first. Not found: error, nothing locked. Read failed otherwise: error, unless the caller passes `version` (then it unpublishes with it and deletes). Read as `ODATA`: unpublish with the caller's `version`, else the one read back, else V4 then V2. InA or SQL: lock, delete, unlock only. Every binding is unlocked after the DELETE: SAP keeps the lock otherwise, and re-creating the name fails ("currently editing").
- **IAM apps:** deleting an InA binding also removes its INA1 service row from every IAM app that lists it, without warning. Neither where-used nor the deletion check reports those apps. `findIamAppsUsingBindings(bindings, { packages?, namePatterns? })` lists customer IAM apps (`Z*`, `Y*` by default) by quick search, reads each one once for all bindings, and returns `{ usages: { binding, app, packageName, serviceType }[], appsScanned, unreadable }` (`unreadable`: apps whose read failed). A search that reaches its 10,000-result limit is an error (the scan would be incomplete); `appsScanned: 0` or any `unreadable` app means the check proves nothing.

---

## Cloud IAM

IAM apps (SIA6), business catalogs (SIA1) with app assignments (SIA7), business role templates (SIA8) with catalog assignments (SIA9). All are blues v1 documents under `/sap/bc/adt/aps/cloud/iam/<kind>`, saved active. Verified on Madiba-Cloud-Dev (2608).

- **IAM app services:** G4BA and IWSV go through `sia6/service/values`, then `service/detail`. INA1 (an InA binding) goes to `service/detail?serviceType=INA1&serviceName=<binding>&appName=<app>` directly.
- **IWSV names:** SAP stores an IWSV `relServiceName` padded with its version (`APJ_JOB_MANAGEMENT_SRV             0001`). Relay reads it as `name` plus `version`; "already listed" compares type, name and (for IWSV, default `0001`) version, so a re-run adds no duplicate row.
- **IAM app save:** new services, `ui5AppId` (one value) and `migrationStatus` are written in one locked full-document PUT. The document read under the lock decides what is still missing (another session may have added a service meanwhile); nothing missing, no PUT. `ui5AppIdReplaced` reports a replaced ID. The create response shows `migrationStatus` empty even when a read shows 3, so `createIamApp` reads the app after creating it.
- **Migration guard:** `migrationStatus` is set to 3 only on a customer External App (`EXT`, name `Z*`/`Y*`, not `YY1_*`) whose element exists and is empty; the element is never inserted. SAP apps (`F1068_TRAN`), inbound-service apps (`IBS`) and key-user apps (`YY1_*`) also show an empty element and are never locked or written. `createBusinessCatalog` applies the guard to each app before assigning it (SIA7 otherwise fails with `CM_APS_IAM_WBI_SIA1`/021).
- **Existing objects:** an IAM app, catalog or role template that exists in another package than requested is refused. The description is set on create only (cut to 60 characters, escaped); results carry `descriptionUpdated: false` and `descriptionDiffers`. Names are trimmed and upper-cased; namespaced names are percent-encoded in paths.
- **Results:** `created`, `changed` (anything written; a publish alone is not a change). A publish that fails after the create/save is returned as `publishError` (`IamPublishError`) beside the result, not instead of it. `deadlineMs` limits the whole call; the publish wait gets what is left.
- **Publish:** the publish POST is synchronous (~2 min) and takes no lock, so it is sent stateless (no context cookie). Two overlapping stateless publishes of one app both ended `p` after ~112 s, so a re-post is safe. Headers as captured: SIA6 `Accept`/`Content-Type: application/vnd.sap.adt.iam.publishing+xml`; SIA1 and SIA8 `Accept: */*`. Policy (`IamPublishOptions`):
  - each request's timeout is 300 s, capped at the time left before the 10 min deadline; a retry inside the request layer (CSRF refresh, lost context) gets the time left, not a fresh timeout;
  - a client timeout re-posts at once; a 502/503/504 or dropped connection waits 30 s;
  - `u` ends a run unpublished: re-post once (after 30 s), then fail as pending;
  - no POST starts with less than 150 s left: fail as pending (`timedOut`);
  - attempts are at least 3 s apart.
- **Publish result:** done is `p` for apps and catalogs, `p` or empty for role templates, read from a `publishingStatus` root in `http://www.sap.com/iam/<kind>` with a `publishingStatusText` child (self-closing is fine) and no message/error child. `IamPublishError` carries `kind`, `objectName`, `failure` (`pending` | `status` | `response` | `request`), `pending`, `timedOut` and `lastStatus`; map on `failure`/`pending`, not on the message. Pending means the object may still publish (record it, retry next run); `status` (ended with another status) and `response` (no clean `publishingStatus`, e.g. a logon page) are definitive. `publishStatus` on the object is no signal (a never-published app reads `p`).
- **Assignments:** `$bucapps` (root `sia1:bucapps`) and `$getsia9?name=<brt>` (root `sia8:businessCatalogs`) list them; any other 200 (a logon page) is an error. Assignments are named `<owner>_NNNN` (at most 30, so a role template name with catalogs is at most 25, checked before the SIA8 is created). When SAP says a name already exists, the assignments are re-listed: a target assigned meanwhile is returned in `assignmentsFound`; otherwise the next number is tried (up to 3 more).
- **Role templates:** every catalog is checked to exist before anything is written. The launchpad space link is a SIAD source object (`.assiad`, `<BRT>_NNNN`, AFF JSON with `generalInformation.businessRoleTemplate` and `launchpadSpaceTemplate`; blues v1 shell; saved active).
- **Delete:** `deleteIamObject(kind, name)` locks, DELETEs and unlocks. SWB_TOOL 029 ("Error while deleting object App from the database", matched by its T100 id and number) names no cause; for an IAM app it is probably still assigned to a catalog, so relay names the catalogs where-used finds and says to remove the SIA7 assignments first. Order: SIAD → SIA9 → SIA8 → SIA7 → SIA6 → SIA1.
- **Binding usage:** `findIamAppsUsingBindings` fails when the search answers 200 with something other than an `objectReferences` listing. An app it cannot read is skipped and listed in `unreadable`.

---

## Deletion service

`/sap/bc/adt/deletion/check` (`application/vnd.sap.adt.deletion.check.request.v1+xml`) and `/sap/bc/adt/deletion/delete` (`application/vnd.sap.adt.deletion.request.v1+xml`) take object URIs of any type, including ones that cannot be locked. `checkDeletion(uris)` returns `isDeletable`, reference counts and the locking transport; `deleteByUri(uris, transport?)` returns `isDeleted` per object. Results are matched to the requested URIs (in request order); a missing result, or a 200 without the `checkResponse`/`deletionResult` root, is an error. `isDeletable` is false when `externalStrongReferences` > 0.

- **App variants (ADVC/LRP):** their vit URI (`appVariantUri(name)`) rejects LOCK (405). `deleteAppVariant(name, transport?)` checks, then deletes through the service; a blank name, a strongly referenced variant, and a package that records changes without a transport are refused up front.

---

## MDA app generator

`generateMdaApp(options)` runs the Multidimensional Analysis app generator (`/sap/bc/adt/analytics/generators/ui/mda-app`) for an analytical query: UIAD, app variant (ADVC/LRP), InA SRVD and SRVB, and optionally the IAM app. Every name is the caller's. Verified on Madiba-Cloud-Dev (package `ZSNAP_BC`).

- **Calls:** `validation`, `preview` and the generate POST each take the content JSON (`application/vnd.sap.adt.serverdriven.content.v1+json; framework=generators.v1`) and `?referencedObject=/sap/bc/adt/ddic/ddl/sources/<query>&package=<pkg>` (without `package` the server dumps). The transport goes in `corrNr` (untested).
- **Stateless:** all three are sent stateless. In the stateful session the generator's existence check is stale: objects deleted since still "already exist", which blocks a re-generate under the same names.
- **Idempotence:** validation (`checks=package,referencedobject,authorization`) returns one `ERROR` per existing object; the texts are matched loosely (SAP writes "defintion" and "App descriptor"). Every object present: generate is `SKIPPED` (`status: 'present'`). Some present: error, nothing generated. Any other `ERROR`: error.
- **App variant:** the generate response lists UIAD, SRVD, SRVB and SIA6 only. The preview names the app variant's system name, which is the same for the same `appVariantId` (also after a delete and re-generate); `generateMdaApp` returns it as `appVariant` for `deleteAppVariant`.
- **Result state:** everything is active. The SRVB is an unpublished InA binding; the IAM app lists it as an INA1 service, has `ui5AppId` = the UIAD and `migrationStatus` 3. No catalog assignment is made.
- **Delete order:** SIA6 → UIAD → app variant → SRVB → SRVD.

---

## Class run

`runClass(className, { timeoutMs? })` runs a class implementing `IF_OO_ADT_CLASSRUN` and returns its console text: `POST /sap/bc/adt/oo/classrun/<class>`, `Accept: text/plain`.

- **Stateless:** always (`X-sap-adt-sessiontype: stateless`, no `sap-contextid`). A stateful session keeps the class load and runs old code after a re-activation; a stateless run sees the new code at once. It holds no locks and leaves the stateful session alone.
- **Errors:** HTTP 500 means the run dumped; the error points to `/sap/bc/adt/runtime/dumps`. `INVALID_TABLE_RANGE` in `CL_ABAP_DOCU_CLASS_POOL` (before the class runs) was seen on stateful runs, with and without ABAP Doc comments; stateless runs of the same classes did not dump. A missing class answers 200 with "Object X of type CLAS does not exist." and is reported as an error.
- **Timeout:** 300 s by default. Clients are independent: run it once per client (e.g. development and customizing).

---

_Last updated: v0.8.0_
