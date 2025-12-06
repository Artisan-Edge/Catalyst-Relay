# Diff Endpoints

Compare local content with server content using Myers diff algorithm.

## Sections

- [POST /git-diff](#post-git-diff)

---

## POST /git-diff

Compare local object content with server content. Uses the Myers diff algorithm to compute line-by-line differences.

### Request

| Method | Path | Auth Required |
|--------|------|---------------|
| POST | `/git-diff` | Yes |

### Request Body

Array of objects with content:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Object name (e.g., `ZTEST_VIEW`) |
| `extension` | string | Yes | File extension (e.g., `asddls`) |
| `content` | string | Yes | Local content to compare |
| `description` | string | No | Optional description |

### Response

Array of diff results:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Object name |
| `extension` | string | File extension |
| `label` | string | Human-readable type label |
| `diffs` | array | Array of diff hunks |

**Diff Hunk Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | enum | `addition`, `deletion`, or `modification` |
| `length` | number | Total lines in hunk |
| `diffStart` | number | Starting line in diff output (0-indexed) |
| `localStart` | number | Starting line in local file (0-indexed) |
| `changes` | varies | Changed lines (see below) |

**Changes Field:**

- For `addition` or `deletion`: `string[]` — array of added/removed lines
- For `modification`: `[string[], string[]]` — tuple of `[serverLines, localLines]`

### Example

**Request:**
```bash
curl -X POST http://localhost:3000/git-diff \
  -H "X-Session-ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "name": "ZTEST_VIEW",
      "extension": "asddls",
      "content": "@AbapCatalog.viewEnhancementCategory: [#NONE]\ndefine view ZTEST_VIEW as select from mara {\n  key matnr,\n  mtart,\n  matkl\n}"
    }
  ]'
```

**Response:**
```json
{
    "success": true,
    "data": [
        {
            "name": "ZTEST_VIEW",
            "extension": "asddls",
            "label": "View",
            "diffs": [
                {
                    "type": "modification",
                    "length": 2,
                    "diffStart": 3,
                    "localStart": 3,
                    "changes": [
                        ["  mtart"],
                        ["  mtart,", "  matkl"]
                    ]
                }
            ]
        }
    ]
}
```

**Response (No Changes):**
```json
{
    "success": true,
    "data": [
        {
            "name": "ZTEST_VIEW",
            "extension": "asddls",
            "label": "View",
            "diffs": []
        }
    ]
}
```

### Errors

| Code | Status | Cause |
|------|--------|-------|
| `VALIDATION_ERROR` | 400 | Invalid request format |
| `SESSION_NOT_FOUND` | 401 | Invalid session |
| `UNKNOWN_ERROR` | 500 | Object does not exist on server |

### Use Cases

- **Pre-save preview** — Show changes before uploading to SAP
- **Conflict detection** — Identify differences after concurrent edits
- **Code review** — Display side-by-side or unified diff view
- **Sync status** — Check if local files match server versions
