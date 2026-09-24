# API Release Endpoints

Read and change the C1 API release contract of CDS DDL sources (DDLS). This is the contract shown in ADT's **API State** tab. Releasing a view under C1 makes it usable from ABAP Cloud development and/or Key User Apps.

## Sections

- [GET /api-release/:name](#get-api-releasename)
  - [Library Usage](#library-usage)
- [POST /api-release/:name/release](#post-api-releasenamerelease)
  - [Library Usage](#library-usage-1)
- [POST /api-release/:name/unrelease](#post-api-releasenameunrelease)
  - [Library Usage](#library-usage-2)
- [POST /api-release/:name/visibility](#post-api-releasenamevisibility)
  - [Library Usage](#library-usage-3)

---

## GET /api-release/:name

Read the current C1 release state of a CDS DDL source.

### Request

| Method | Path                 | Auth Required |
| ------ | -------------------- | ------------- |
| GET    | `/api-release/:name` | Yes           |

### Path Parameters

| Parameter | Type   | Required | Description                               |
| --------- | ------ | -------- | ----------------------------------------- |
| `name`    | string | Yes      | DDLS object name (e.g., `ZSNAP_F04S_Q01`) |

### Response

| Field                | Type                 | Description                                                                                   |
| -------------------- | -------------------- | --------------------------------------------------------------------------------------------- |
| `name`               | string               | Object name                                                                                   |
| `uri`                | string               | ADT URI of the object                                                                         |
| `status`             | ApiReleaseStatus     | `NOT_RELEASED`, `RELEASED`, `DEPRECATED`, `NOT_TO_BE_RELEASED` or `NOT_TO_BE_RELEASED_STABLE` |
| `statusDescription`  | string               | Readable status (e.g., `Released`)                                                            |
| `released`           | boolean              | `true` when `status` is `RELEASED`                                                            |
| `allowedTransitions` | ApiReleaseStatus[]   | States the contract can move to from the current one                                          |
| `visibility`         | ApiReleaseVisibility | `useInCloudDevelopment` and `useInKeyUserApps` flags (both `false` while not released)        |
| `changedBy`          | string?              | User who last changed the contract                                                            |
| `changedAt`          | string?              | When the contract was last changed                                                            |

### Example

**Response:**

```json
{
  "success": true,
  "data": {
    "name": "ZSNAP_F04S_Q01",
    "uri": "/sap/bc/adt/ddic/ddl/sources/zsnap_f04s_q01",
    "status": "RELEASED",
    "statusDescription": "Released",
    "released": true,
    "allowedTransitions": ["NOT_RELEASED", "DEPRECATED"],
    "visibility": { "useInCloudDevelopment": true, "useInKeyUserApps": false },
    "changedBy": "DEVELOPER"
  }
}
```

### Errors

| Code                | Status | Cause                              |
| ------------------- | ------ | ---------------------------------- |
| `VALIDATION_ERROR`  | 400    | Missing object name                |
| `SESSION_NOT_FOUND` | 401    | Invalid session                    |
| `UNKNOWN_ERROR`     | 500    | SAP error (e.g., object not found) |

### Library Usage

```typescript
const [state, error] = await client.getApiReleaseState("ZSNAP_F04S_Q01");
if (error) throw error;
console.log(state.status, state.visibility);
```

**Return type:** `AsyncResult<ApiReleaseState>`

---

## POST /api-release/:name/release

Release the C1 contract. The relay first runs SAP's contract validation. If it reports errors, the release is aborted and nothing changes. Warnings (e.g., "referenced data element is not released") do not block and are returned in `messages`.

If the view is already released, nothing is sent: the result has `changed: false` and an info message. When its current flags differ from the requested ones, the message says the request was not applied. Use [`POST /api-release/:name/visibility`](#post-api-releasenamevisibility) to change them.

### Request

| Method | Path                         | Auth Required |
| ------ | ---------------------------- | ------------- |
| POST   | `/api-release/:name/release` | Yes           |

### Request Body

The body is optional.

| Field                   | Type    | Required | Description                                             |
| ----------------------- | ------- | -------- | ------------------------------------------------------- |
| `transport`             | string  | No       | Transport request (required for transportable packages) |
| `useInCloudDevelopment` | boolean | No       | "Use in Cloud Development" checkbox. Default `true`     |
| `useInKeyUserApps`      | boolean | No       | "Use in Key User Apps" checkbox. Default `false`        |

At least one visibility flag must be `true`.

### Response

| Field        | Type                          | Description                                             |
| ------------ | ----------------------------- | ------------------------------------------------------- |
| `name`       | string                        | Object name                                             |
| `status`     | ApiReleaseStatus              | Resulting contract status                               |
| `visibility` | ApiReleaseVisibility          | Resulting visibility flags                              |
| `changed`    | boolean                       | `false` when already in the target state (nothing sent) |
| `messages`   | ApiReleaseValidationMessage[] | Non-blocking validation messages                        |

Each message has `severity` (`error`, `warning`, `info`), `text`, and optionally `msgid` and `msgno`.

### Example

**Request:**

```json
{
  "transport": "DEVK900123"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "name": "ZSNAP_F04S_Q01",
    "status": "RELEASED",
    "visibility": { "useInCloudDevelopment": true, "useInKeyUserApps": false },
    "changed": true,
    "messages": [
      {
        "severity": "warning",
        "text": "Data element ZSNAP_DE is not released",
        "msgid": "ARS_DEP_CHECKS"
      }
    ]
  }
}
```

### Errors

| Code                | Status | Cause                                                                     |
| ------------------- | ------ | ------------------------------------------------------------------------- |
| `VALIDATION_ERROR`  | 400    | Missing object name or invalid body                                       |
| `SESSION_NOT_FOUND` | 401    | Invalid session                                                           |
| `UNKNOWN_ERROR`     | 500    | Both visibility flags `false`, validation errors, missing transport, etc. |

### Library Usage

```typescript
// Cloud Development only (default)
const [result, error] = await client.releaseApi("ZSNAP_F04S_Q01", "DEVK900123");

// Cloud Development and Key User Apps
const [both] = await client.releaseApi("ZSNAP_F04S_Q01", "DEVK900123", {
  useInCloudDevelopment: true,
  useInKeyUserApps: true,
});
```

**Return type:** `AsyncResult<ApiReleaseResult>`

**Parameters:** `objectName: string`, `transport?: string`, `visibility?: ApiReleaseVisibility`.

---

## POST /api-release/:name/unrelease

Revert the C1 contract to `NOT_RELEASED`. The relay reads the current visibility flags and sends them back unchanged, so unreleasing never changes visibility as a side effect. Validation works as for release. If the view is already not released, nothing is sent and the result has `changed: false`.

### Request

| Method | Path                           | Auth Required |
| ------ | ------------------------------ | ------------- |
| POST   | `/api-release/:name/unrelease` | Yes           |

### Request Body

The body is optional.

| Field       | Type   | Required | Description                                             |
| ----------- | ------ | -------- | ------------------------------------------------------- |
| `transport` | string | No       | Transport request (required for transportable packages) |

### Response

Same shape as [release](#post-api-releasenamerelease).

### Errors

| Code                | Status | Cause                                                         |
| ------------------- | ------ | ------------------------------------------------------------- |
| `VALIDATION_ERROR`  | 400    | Missing object name or invalid body                           |
| `SESSION_NOT_FOUND` | 401    | Invalid session                                               |
| `UNKNOWN_ERROR`     | 500    | State read failed, validation errors, missing transport, etc. |

### Library Usage

```typescript
const [result, error] = await client.unreleaseApi(
  "ZSNAP_F04S_Q01",
  "DEVK900123",
);
```

**Return type:** `AsyncResult<ApiReleaseResult>`

---

## POST /api-release/:name/visibility

Change the visibility flags of a released view without unreleasing it. Flags left out keep their current value. Narrowing a live contract can be refused by SAP or be hard to undo, so `preview: true` runs only SAP's validation and applies nothing.

### Request

| Method | Path                            | Auth Required |
| ------ | ------------------------------- | ------------- |
| POST   | `/api-release/:name/visibility` | Yes           |

### Request Body

| Field                   | Type    | Required | Description                                             |
| ----------------------- | ------- | -------- | ------------------------------------------------------- |
| `transport`             | string  | No       | Transport request (required for transportable packages) |
| `useInCloudDevelopment` | boolean | No       | New value; omitted keeps the current one                |
| `useInKeyUserApps`      | boolean | No       | New value; omitted keeps the current one                |
| `preview`               | boolean | No       | Run SAP's validation only, without applying the change  |

The resulting visibility must keep at least one flag `true`. If it already matches the current flags, nothing is sent.

### Response

| Field        | Type                          | Description                                                      |
| ------------ | ----------------------------- | ---------------------------------------------------------------- |
| `name`       | string                        | Object name                                                      |
| `previous`   | ApiReleaseVisibility          | Visibility before the update                                     |
| `requested`  | ApiReleaseVisibility          | Current flags with the requested changes applied                 |
| `visibility` | ApiReleaseVisibility          | Visibility after the update (equals `previous` unless applied)   |
| `changed`    | boolean                       | `true` when the change was applied                               |
| `preview`    | boolean                       | `true` when only validation ran                                  |
| `messages`   | ApiReleaseValidationMessage[] | Validation warnings/info, or a note when nothing needed changing |

### Example

**Request (preview):**

```json
{
  "transport": "DEVK900123",
  "useInKeyUserApps": false,
  "preview": true
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "name": "ZSNAP_F04S_Q01",
    "previous": { "useInCloudDevelopment": true, "useInKeyUserApps": true },
    "requested": { "useInCloudDevelopment": true, "useInKeyUserApps": false },
    "visibility": { "useInCloudDevelopment": true, "useInKeyUserApps": true },
    "changed": false,
    "preview": true,
    "messages": []
  }
}
```

### Errors

| Code                | Status | Cause                                                                                  |
| ------------------- | ------ | -------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR`  | 400    | Missing object name or invalid body                                                    |
| `SESSION_NOT_FOUND` | 401    | Invalid session                                                                        |
| `UNKNOWN_ERROR`     | 500    | View not released, both flags would be off, validation errors, missing transport, etc. |

### Library Usage

```typescript
const change = { useInKeyUserApps: false };

// Check first, then apply
const [check] = await client.updateApiReleaseVisibility(
  "ZSNAP_F04S_Q01",
  change,
  {
    transport: "DEVK900123",
    preview: true,
  },
);
const [result, error] = await client.updateApiReleaseVisibility(
  "ZSNAP_F04S_Q01",
  change,
  {
    transport: "DEVK900123",
  },
);
```

**Return type:** `AsyncResult<ApiReleaseVisibilityResult>`

**Parameters:** `objectName: string`, `change: Partial<ApiReleaseVisibility>`, `options?: ApiReleaseVisibilityOptions` (`transport?: string`, `preview?: boolean`).

---

_Last updated: v0.6.9_
