# SAP ADT Domain Knowledge

SAP-specific concepts and behaviors for working with ADT (ABAP Development Tools).

## Sections

- [CSRF Token Flow](#csrf-token-flow)
- [SSL Verification](#ssl-verification)
- [Form-based objects and function modules](#form-based-objects-and-function-modules)

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

Data elements and domains have no `/source/main`: the object URI holds a vendor XML document. Relay translates `.asdtel` / `.asdoma` DSL to and from it (`src/core/ddic`). Captured responses live in `src/__tests__/fixtures/ddic/`.

| Type          | Object URI                                           | Media type                                    |
| ------------- | ---------------------------------------------------- | --------------------------------------------- |
| Data element  | `/sap/bc/adt/ddic/dataelements/{name}`               | `application/vnd.sap.adt.dataelements.v2+xml` |
| Domain        | `/sap/bc/adt/ddic/domains/{name}`                    | `application/vnd.sap.adt.domains.v2+xml`      |
| Function mod. | `/sap/bc/adt/functions/groups/{group}/fmodules/{fm}` | source at `{uri}/source/main` (text)          |

- **Create:** one POST of the full document to the collection (201, inactive). Function groups and modules: POST a shell with `Content-Type: application/*`; a module carries `adtcore:containerRef` instead of `packageRef`.
- **Update / delete:** lock `{objectUri}?_action=LOCK`, then PUT (vendor type) or DELETE `{objectUri}?lockHandle=…`. Function modules lock the object URI and PUT the source URI.
- **Read:** GET returns the inactive version when one exists. A PUT of a GET body is accepted; unmodelled fields survive.
- **Derived values:** output length `000000` and label field lengths `0` are filled in by SAP on activation.
- **Activation:** activating new function modules also activates their new group. A domain whose conversion routine doesn't exist fails activation ("Conversion routine X does not exist").
- **Check runs:** `checkObject` without artifacts works, but several DDIC objects in one run repeat each other's messages, so check them one per run.
- **Type codes:** ADT's `dataType` is the uppercase CDS kind (`CHAR`, `NUMC`, `DEC`, `STRING`, `RAWSTRING`, `SSTRING`), not the DD01L codes (`STRG`, `RSTR`, `SSTR` are silently dropped).
- **ABAP Cloud:** objects inherit `cloudDevelopment` from a development package, so no attribute is sent. `$TMP` can't hold them (403 `S_ABPLNGVS`, or activation fails with an explicit version). Verified in a Cloud package: function groups, function modules, domains with conversion routines, data elements.

---

_Last updated: v0.7.0_
