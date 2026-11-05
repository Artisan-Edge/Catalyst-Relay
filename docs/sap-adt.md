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

_Last updated: v0.8.0_
