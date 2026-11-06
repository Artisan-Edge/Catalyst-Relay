# Changelog - v0.10.0

## Release Date

November 6, 2026

## Overview

Everything needed to deploy a Fiori launchpad app on ABAP Cloud. This release adds launchpad sources (app descriptor items, page and space templates, role template space assignments), InA service bindings, business role templates, publish and delete for IAM objects, the deletion service, SAP's MDA app generator and stateless class runs. IAM publishing now waits for SAP's synchronous publish and reports a failed publish beside the result instead of failing the whole call.

Terms used below:

- **IAM app (SIA6):** grants access to services (OData, InA) and a UI5 app.
- **Business catalog (SIA1):** groups IAM apps through app assignments (SIA7).
- **Business role template (SIA8):** groups catalogs through catalog assignments (SIA9).
- **SIAD:** links a role template to a launchpad space template.
- **Launchpad sources:** an app descriptor item (UIAD: tiles and target mapping), a page template (UIPG) and a space template (UIST, which lists pages).
- **InA binding:** a service binding for analytical queries (InA protocol) instead of OData.
- **MDA generator:** SAP's Multidimensional Analysis app generator, which builds a launchpad app for an analytical query.
- **"Publish Locally":** SAP's action that makes an IAM object usable on the current system.

## Breaking Changes

Signatures stay compatible except where noted. Callers will notice these differences:

- **IAM creates no longer fail on a failed publish.** `createIamApp()`, `createBusinessCatalog()` and `createRoleTemplate()` used to send one stateful publish POST under the default 30 s request timeout and return its error as the call's error. The publish now waits for SAP's synchronous publish (about 2 minutes; 300 s per request, 10 min overall, with re-posts, see [Publishing](#publishing-iam-objects)). A failed or pending publish comes back as `publishError` (`IamPublishError`) inside an **ok** result, because everything else is already saved. Check `result.publishError` and `result.published` (now `true` only on a finished publish). `publish: false` still saves without publishing. `deadlineMs` limits the whole call, and the publish gets whatever time is left.
- **IAM creates refuse an object in another package.** An existing IAM app, catalog or role template in a package other than `packageName` is an error (it used to be reused silently). The description is set only when the object is created, and is cut to 60 characters. Results report `descriptionUpdated: false` and `descriptionDiffers`.
- **IAM creates migrate customer apps.** When `migrationStatus` is empty, it is set to `3` on customer External Apps (`EXT`, `Z*`/`Y*`, not `YY1_*`). `createIamApp()` does this for its own app, and `createBusinessCatalog()` does it for each app before assigning it (SIA7 refuses unmigrated apps). Each change is reported in `migrated` / `appsMigrated`. SAP apps, inbound-service (`IBS`) apps and key-user apps are never written. `createBusinessCatalog()` now checks that every app exists before it creates the catalog, and `createRoleTemplate()` checks every catalog the same way.
- **`readIamApp()` splits the version off `services[].name`.** SAP pads an IWSV (OData V2) `relServiceName` with its version (`APJ_JOB_MANAGEMENT_SRV             0001`). `name` is now just the service name (trimmed, upper case), and the version is in the new `version` field (`''` for G4BA and INA1). `IamAppInfo` also gains `ui5AppId` and `migrationStatus` (`string | null`), so objects built by hand (mocks) need the new fields.
- **`deleteServiceBinding()` reads the binding first.** If the binding does not exist, the call returns an error and locks nothing. Any other read failure is also an error, unless you pass `version`, in which case that version is unpublished and the binding deleted. OData bindings are unpublished with your `version`, else the version read back, else V4 then V2. InA (and other non-OData) bindings are not unpublished, because an OData job on one dumps and ends the session. Every binding is now unlocked after the DELETE. Before, it stayed locked and re-creating the name failed with "currently editing".
- **`createServiceBinding()` compares the binding type on re-runs.** An existing binding of another type (`srvb:type`) is an error naming the type. `ServiceBindingType` is now `'ODATA' | 'INA'`, and `ServiceBindingResult` gains `bindingType`. Exhaustive switches over the type need a new case.
- **Stateless requests leave the stateful session alone.** Stateless requests (`X-sap-adt-sessiontype: stateless`) already went out without the `sap-contextid` cookie. Now a stateless response can no longer replace that cookie, and a stateless 500 that mentions an expired session no longer resets the session. A stateless 400 `ICMENOSESSION` goes back to the caller instead of being retried on a new context, so the stateful context and its locks stay.
- **`Set-Cookie` parsing keeps hyphenated cookies.** A joined `Set-Cookie` header used to be split only before names made of word characters. So `sap-contextid` (and any other hyphenated cookie) after the first cookie was merged into the cookie before it. Each `Set-Cookie` header is now read on its own (`Headers.getSetCookie()`, with a split before every `name=` as fallback).
- **Retries inside one request share its timeout.** The CSRF-refresh retry and the lost-context retry get the time left of the original timeout instead of a fresh one. With less than 1 s left, the request fails with `No time left to retry …`.
- **Server mode: `POST` create service binding no longer requires a transport** for non-`$TMP` packages (`TRANSPORT_REQUIRED` removed). SAP decides whether the package records changes. `bindingType` accepts `'INA'`.
- **Type additions.** `ConfiguredExtension` gains `asuiad`, `asuipg`, `asuist` and `assiad`, so a `Record<ConfiguredExtension, …>` in caller code needs the new keys. `BusinessCatalogResult` and `RoleTemplateResult` gain `assignmentsNotRequested` and `assignmentsFound`, the catalog result also gains `appsMigrated`, and `IamAppResult.steps` gains `ui5AppId` and `migration` (additive). `MdaGenerateResult.transportSkipped` is required, so an `MdaGenerateResult` built by hand must set it.

## What's New

### Fiori launchpad sources

| Extension | Object                                           | Collection                       | Saved    |
| --------- | ------------------------------------------------ | -------------------------------- | -------- |
| `asuiad`  | Launchpad app descriptor item (UIAD/TYP)         | `/sap/bc/adt/fiori/uiad`         | active   |
| `asuipg`  | Launchpad page template (UIPG/TYP)               | `/sap/bc/adt/fiori/uipgtyp`      | inactive |
| `asuist`  | Launchpad space template (UIST/TOP)              | `/sap/bc/adt/fiori/uisttop`      | inactive |
| `assiad`  | Role template ↔ space template assignment (SIAD) | `/sap/bc/adt/aps/cloud/iam/siad` | active   |

All four are abap-file-formats (AFF) JSON at `{uri}/source/main` and work with `read`, `create`, `update`, `upsert`, `delete`, `gitDiff` and `activate`.

- **Create:** the launchpad types POST a `blue:blueSource` shell as blues v2, and SIAD uses blues v1. The description is `header.description`, else `generalInformation.title`, else the name.
- **Required header:** `header.description` and `header.originalLanguage` must be set and non-empty. Without them SAP stores an empty description, or dumps on a space. SIAD also needs `generalInformation.businessRoleTemplate` and `generalInformation.launchpadSpaceTemplate`. An empty source, one that is not a JSON object, or one missing a required path is refused before any request. `upsert()` checks the whole batch before its first write.
- **Compare:** `upsert()` reports `unchanged` despite SAP's rewrites on save. It ignores:
  - `header` keys SAP adds where the file leaves them out, and `header.abapLanguageVersion` everywhere
  - the case of `header.originalLanguage`, and a numeric `formatVersion`
  - `false` booleans, which SAP drops
  - page defaults (`type: "ladiAssignment"`, `displayFormat: "standard"`, `catalogType: "standard"`)

  A local source that a write would refuse never compares as unchanged. `gitDiff()` follows the same rules.

- **Order:** `upsert()` writes these types after every other type: items, then pages, then spaces, then SIAD.
- **Activation:** UIAD and SIAD are skipped (always active). A space without `sortPriority` may warn, which counts as success.
- **Move:** `changePackage()` refuses all four (`ObjectConfig.moveUnsupported`).

```typescript
const [results, error] = await client.upsert(
  [
    { name: "ZSNAP_F70", extension: "asuiad", content: uiadJson },
    { name: "ZSNAP_PAGE", extension: "asuipg", content: pageJson },
    { name: "ZSNAP_SPACE", extension: "asuist", content: spaceJson },
    { name: "ZSNAP_BRT_0001", extension: "assiad", content: siadJson },
  ],
  "ZSNAP_BC",
  transport,
);
```

`requireAffJsonPaths(content, getConfigByExtension(ext)?.affJson, label)` runs the same pre-write check without HTTP. `ObjectConfig.affJson` (`AffJsonRules`, `AffJsonDefault`) describes each type's rules.

### InA service bindings

```typescript
const [binding, error] = await client.createServiceBinding({
  bindingName: "ZSNAP_F70_SB",
  serviceDefinition: "ZSNAP_F70_SD",
  packageName: "ZSNAP_BC",
  bindingType: "INA",
});
```

- An InA binding is always a UI binding with no OData version. `bindingVersion`, `bindingCategory: 'WEB_API'` and `publish: true` are rejected.
- It is validated as `serviceBindingVersion=INA` and created without `srvb:version`. Activation creates its `INA1` runtime service.
- It is never published: SAP still offers PUBLISH, but the publish job dumps.
- `readServiceBinding()` reports `bindingType: 'INA'`, `category: 'UI'` and `odataVersion: ''`.
- **`activateServiceBinding(name)`** activates a binding again, for example after its service definition was widened. `activate()` cannot address SRVB.

### Cloud IAM

**IAM apps** (`createIamApp`):

- `services` accepts `INA1` (an InA binding) besides `G4BA` (OData V4) and `IWSV` (OData V2).
- `ui5AppId` sets the app's UI5 app ID (one value). A different existing ID is replaced and reported in `ui5AppIdReplaced`.
- New services, the UI5 app ID and the migration are saved in one locked PUT. The document read under the lock decides what is still missing, so a run that overlaps another session adds no duplicate rows.
- "Already listed" compares type, name and the IWSV version (default `0001`). Re-runs no longer add a padded IWSV service again.
- Results carry `changed` (anything written; a publish alone is not a change), `migrated` and `steps.ui5AppId` / `steps.migration`.

**Business catalogs** (`createBusinessCatalog`):

- When SAP reports an assignment name as already taken, the assignments are listed again. An app that another session assigned in the meantime is returned in `assignmentsFound`; otherwise the next `<catalog>_NNNN` is tried (up to 3 more).
- Existing assignments of apps you did not name are left in place and reported in `assignmentsNotRequested`.

**Business role templates** (new):

```typescript
const [template, error] = await client.createRoleTemplate({
  templateName: "ZSNAP_BRT",
  packageName: "ZSNAP_BC",
  description: "SNAP analytics",
  catalogs: ["ZSNAP_BC_CAT"],
  transport,
});
if (template?.publishError?.pending) recordForRetry(template.name);
```

- `createRoleTemplate()` creates the template (SIA8), assigns catalogs (SIA9, `<template>_NNNN`) and publishes. It handles name collisions the same way as catalogs and reports `assignmentsAdded`, `assignmentsFound` and `assignmentsNotRequested`.
- With catalogs, the name is at most 25 characters (assignment names are at most 30). The length and every catalog are checked before anything is written.
- `readRoleTemplate(name)` returns `RoleTemplateInfo` with `catalogs`, `scopeDependent` and `fioriSpaceId`.
- The launchpad space is linked through a separate `.assiad` source (see above), written with `upsert()`.

#### Publishing IAM objects

`publishIamApp`, `publishBusinessCatalog` and `publishRoleTemplate(name, options?)` run "Publish Locally" and return the final status or an `IamPublishError`. The create methods use the same wait.

- The publish POST is synchronous (about 2 minutes) and takes no lock, so it is sent stateless. The stateful session stays free.
- **Re-post rules:**
  - A client timeout re-posts at once.
  - A 502/503/504 or a dropped connection re-posts after 30 s.
  - A run that ends `u` (unpublished) is re-posted once after 30 s, and then fails as pending.
  - No POST starts with less than 150 s left before the deadline; that fails as pending with `timedOut`.
  - Attempts are at least 3 s apart.
- **Done:** `p` for apps and catalogs; `p` or `''` for role templates. The response must be a clean `publishingStatus` document. `publishStatus` on the object is not used, because a never-published app also reads `p`.
- **`IamPublishFailure`:**

  | `failure`  | Meaning                                                               |
  | ---------- | --------------------------------------------------------------------- |
  | `pending`  | may still publish: record it and retry later (`pending: true`)        |
  | `status`   | SAP ended the publish with another status (definitive)                |
  | `response` | a 200 that is not a publishing status, e.g. a logon page (definitive) |
  | `request`  | HTTP or connection error                                              |

  `IamPublishError` also carries `kind`, `objectName`, `timedOut` and `lastStatus`. Map on `failure` / `pending`, not on the message.

- **Timing:** override with `IamPublishOptions`: `requestTimeoutMs`, `retryDelayMs`, `deadlineMs`, `minPostWindowMs`, `minAttemptDelayMs`. NaN, negative and `Infinity` fall back to the default for every option, and so does a `requestTimeoutMs` of 0. A `deadlineMs` of 0 is valid: it returns a pending `IamPublishError` (`timedOut`) at once, without a POST. That is what a create call gets when its own `deadlineMs` is used up.

```typescript
const [status, error] = await client.publishBusinessCatalog("ZSNAP_BC_CAT");
if (error instanceof IamPublishError && error.pending)
  recordForRetry(error.objectName);
```

#### Deleting IAM objects and finding binding users

- **`deleteIamObject(kind, name, transport?)`** locks, DELETEs and unlocks an IAM object, where `kind` is `'sia1' | 'sia6' | 'sia7' | 'sia8' | 'sia9'`. Delete in the order SIAD → SIA9 → SIA8 → SIA7 → SIA6 → SIA1. When an app is still assigned, SAP returns SWB_TOOL 029, which names no cause. The error then names the catalogs that where-used finds and says to delete the SIA7 assignments first.
- **`findIamAppsUsingBindings(bindings, { packages?, namePatterns? })`** lists customer IAM apps (default `Z*`, `Y*`) and reads each one once. It returns:
  - `usages`: one `{ binding, app, packageName, serviceType }` per app and binding
  - `appsScanned`: how many apps were checked
  - `unreadable`: apps whose read failed

  Deleting an InA binding silently removes its INA1 row from every IAM app, and neither where-used nor the deletion check reports those apps. `appsScanned: 0` or any `unreadable` app means the scan proves nothing. A search that reaches its 10,000-result limit is an error.

### Deletion service and app variants

- **`checkDeletion(uris)`** and **`deleteByUri(uris, transport?)`** use ADT's generic deletion service, which takes object URIs of any type, including types that cannot be locked.
  - A check returns `isDeletable`, strong and weak reference counts, `recording` and `lockingTransport`.
  - A delete returns `isDeleted` per object.
  - Results come back in request order. A missing result, or a response without the expected root, is an error.
- **`deleteAppVariant(name, transport?)`** deletes a Fiori app variant (ADVC/LRP), whose URI rejects LOCK. It runs the deletion check first and refuses a blank name, a strongly referenced variant, and a recording package without a transport. `appVariantUri(name)` builds the URI without HTTP.

### MDA app generator

`validateMdaApp`, `previewMdaApp` and `generateMdaApp(options)` drive SAP's MDA generator for an analytical query. One call creates the UIAD, the app variant, an InA service definition and binding, and optionally the IAM app, all under your names. Every call is stateless, because the stateful session's existence check goes stale after a delete.

```typescript
const [generated, error] = await client.generateMdaApp({
  queryName: "ZSNAP_F70_Q",
  packageName: "ZSNAP_BC",
  appDescriptor: "ZSNAP_F70",
  appVariantId: "customer.ZSNAP_F70_AV",
  title: "Inventory analysis",
  semanticObject: "ZSnapInventory",
  semanticAction: "analyze",
  serviceDefinition: "ZSNAP_F70_SD",
  serviceBinding: "ZSNAP_F70_SB",
  iamApp: "ZSNAP_F70_EXT",
});
// generated.status: 'created' | 'present'; generated.appVariant feeds deleteAppVariant()
```

- **Validation as a pre-check:**
  - Every object present: the generate step is skipped (`status: 'present'`).
  - Some present (`set: 'partial'`): error, nothing generated.
  - Any other error-severity message: error. Every severity other than OK, INFO, WARNING and SUCCESS counts as an error.
  - "Already exists" texts are matched by whole object name, so `ZFOO_SB` does not match `ZFOO_SB2`.
- **Options are checked up front:** a required name that is missing or longer than the generator schema allows is refused. The limits are 32 characters for the app descriptor, 30 for SRVD and SRVB, and 35 for the IAM app.
- **Preview:** `generateMdaApp()` returns the app variant's system name from the preview as `appVariant`, because the generate response leaves it out.
- **Transport:** `transport` is passed (as `corrNr`) only when the package records changes. SAP's generator fails when given a transport for a package that does not: it creates the SRVD and SRVB, then reports "Generation error: An exception was raised". So with a transport, `generateMdaApp()` first reads the package and fails before generating if that read fails. `transportSkipped: true` in the result says the transport was left out.
- **Timeout:** the generate request times out after 300 s by default (`timeoutMs`). A timeout says to re-run, and validation then reports the set as present or partial.

### Class run

```typescript
const [output, error] = await client.runClass("ZCL_SNAP_SETUP");
```

`runClass(className, { timeoutMs? })` runs a class that implements `IF_OO_ADT_CLASSRUN` and returns its console text.

- It always runs stateless, so a re-activated class runs its new code (a stateful session keeps the old class load). It holds no locks.
- HTTP 500 is reported as a dump, with a pointer to `/sap/bc/adt/runtime/dumps`.
- A missing class (SAP answers 200 with "does not exist") is an error, and so is an HTML page such as a logon page.
- The timeout defaults to 300 s.

## Technical Details

- **New** `src/core/adt/iam/`:
  - `publish.ts`: `publishAndWait()`, `publishingStatusText()`, `IamPublishError`.
  - `roleTemplate.ts`: SIA8/SIA9.
  - `assignmentName.ts`: `<owner>_NNNN`, collision retries, length check.
  - `serviceName.ts`: IWSV name/version split, listed-service match.
  - `delete.ts`: lock/DELETE/unlock, SWB_TOOL 029.
  - `bindingUsage.ts`.
- **Changed** `src/core/adt/iam/app.ts`: `resolveIamServices()` (INA1 goes straight to `service/detail`), `saveIamAppChanges()` (one locked PUT, re-checked under the lock), `needsMigration()` / `isCustomerExtApp()`, `applyIamAppChanges()`. `addIamAppServices()` and `appendServices()` are removed from the `core/adt` barrel; they were not exported from `catalyst-relay`.
- **Changed** `src/core/adt/iam/helpers.ts`:
  - `iamName()` trims and upper-cases names, and `iamObjectPath()` percent-encodes them.
  - `iamDescription()` cuts descriptions to 60 characters.
  - `requireSamePackage()` refuses an object in another package.
  - `requireRoot()` makes a 200 logon page an error instead of an empty listing.
  - `submitIamPublish()` is removed.
  - Values in IAM XML bodies are escaped.
- **Changed** `src/core/adt/iam/catalog.ts`: `$bucapps` must have a `sia1:bucapps` root, and `$publish` is sent with `Accept: */*` (as SAP's own client sends it).
- **New** `src/core/adt/aff/applyAffJsonRules.ts`, `requireAffJsonPaths.ts` and `refuseInvalidAffSource.ts`. `affJsonEquivalent()` takes optional rules, and `affJsonDescription()` falls back to `generalInformation.title`.
- **Changed** `src/core/adt/types.ts`: four new `OBJECT_CONFIG_MAP` entries, `ObjectConfig.affJson` and `ObjectConfig.moveUnsupported`.
- **Changed** `src/core/adt/craud/create.ts` and `update.ts`, and `src/client/methods/craud/update.ts` and `upsert.ts`: AFF pre-checks; launchpad types go in the last waves.
- **Changed** `src/core/adt/businessservices/`: InA in `create.ts` and `validate.ts`, read-first `delete.ts`, `defaultBindingCategory()` and `INA_BINDING_TYPE`. `activate.ts` trims and encodes the name.
- **New** `src/core/adt/deletion/`, `src/core/adt/generators/` and `src/core/adt/classrun/`, with client methods under `src/client/methods/deletion`, `generators`, `classrun` and `iam` (`createRoleTemplate`, `publishIam`, `deleteIam`, `findIamAppsUsingBindings`, `publishWithin`).
- **Changed** `src/client/methods/internal/request.ts` and `cookies.ts`: stateless cookie, reset and ICMENOSESSION handling; retry time budget; `storeCookies(response, skip?)`. `REQUEST_TIMEOUT_MESSAGE` is now a constant in `src/core/utils/headers.ts`.
- **New exports from `catalyst-relay`:**
  - Runtime: `IamPublishError`, `appVariantUri`, `requireAffJsonPaths`.
  - Types: `IamCreateOutcome`, `IamPublishFailure`, `IamObjectKind`, `IamPublishOptions`, the role template, binding usage, deletion, MDA and `RunClassOptions` types, `AffJsonRules` and `AffJsonDefault`.
- **Server mode:** only the create service binding route changed (`INA`, no transport rule). The new client methods have no HTTP routes.
- **Docs:**
  - `docs/sap-adt.md` has new sections: Fiori launchpad sources, InA service bindings, Cloud IAM, Deletion service, MDA app generator and Class run.
  - `docs/endpoints/objects.md` and `diff.md` cover the launchpad AFF compare rules and the move refusal.
  - The README tables list all object types and client methods.
- **Tests:**
  - New unit suites: `launchpadSources`, `serviceBinding` (InA, delete), `iamApp`, `iamPublish`, `iamReview`, `roleTemplate`, `bindingUsage`, `deletion`, `mdaApp`, `runClass` and `requestRecovery`.
  - Extended suites: `statelessRequest`, `upsert`, `iam` and `index` (21 configured types).
  - New fixtures captured from Madiba-Cloud-Dev.

## Known Limitations

- **MDA generator with a transport:** skipping the transport for a package that does not record changes was verified on Madiba-Cloud-Dev. Generating into a package that records changes, with the transport passed as `corrNr`, is not yet verified.

## Commits Included

- 595b5eb - [UPDATE] Fiori launchpad sources (asuiad, asuipg, asuist) and InA service bindings; binding delete unpublishes only readable OData bindings and unlocks after DELETE
- 955cbbb - [UPDATE] IAM: INA1 services, ui5AppId, migration guard, stateless publish wait; role templates (SIA8/SIA9, .assiad SIAD); IAM delete, deletion service and app variant delete, IAM apps using bindings; chunk A review fixes (AFF batch pre-check, required launchpad headers, AFF normalisation, binding delete aborts on unreadable binding)
- 530d879 - [UPDATE] MDA generator client and stateless class run; chunk B review fixes (typed IAM publish errors and publish policy, migration guard, package/description/ui5AppId reporting, assignment races, escaping, deletion URI matching, partial create results, activateServiceBinding); stateless requests never reset the session or replace the context cookie
- d369aa2 - [UPDATE] C+D review fixes: stateless ICMENOSESSION keeps the stateful context, Set-Cookie keeps hyphenated cookies, MDA validation counts every error severity and matches whole names, class run refuses HTML pages, 503 transient and publish timings validated, catalog/role template results report assignmentsNotRequested; README tables
- a8b2e9b - [UPDATE] MDA generator passes the transport only for packages that record changes (transportSkipped); a publish deadline of 0 is pending at once, a request timeout of 0 uses the default
- d513f4f - [UPDATE] Docs: MDA generator transport gating (recordChanges, transportSkipped), deadlineMs 0
