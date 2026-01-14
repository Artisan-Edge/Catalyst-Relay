# Diff Endpoints

Compare local content with server content using Myers diff algorithm.

## Sections

- [POST /git-diff](#post-git-diff)
  - [Library Usage](#library-usage)

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

### Library Usage

When using Catalyst-Relay as a library, call `client.gitDiff()` to compare local content with server content.

**Method Signature:**

```typescript
client.gitDiff(objects: ObjectContent[]): AsyncResult<DiffResult[]>
```

**Types:**

```typescript
import type { ObjectContent, DiffResult, DiffHunk } from 'catalyst-relay';

// Input type
interface ObjectContent {
    name: string;           // Object name (e.g., 'ZTEST_VIEW')
    extension: string;      // File extension (e.g., 'asddls')
    content: string;        // Local content to compare
    description?: string;   // Optional description
}

// Return types
interface DiffResult {
    name: string;
    extension: string;
    label: string;          // Human-readable type label
    diffs: DiffHunk[];
}

// DiffHunk types:
// - SimpleDiffHunk (addition/deletion)
type SimpleDiffHunk = {
    type: 'addition' | 'deletion';
    length: number;
    diffStart: number;      // Starting line in diff output (0-indexed)
    localStart: number;     // Starting line in local file (0-indexed)
    changes: string[];      // Array of added/removed lines
}

// - ModifiedDiffHunk
type ModifiedDiffHunk = {
    type: 'modification';
    length: number;
    diffStart: number;
    localStart: number;
    changes: [string[], string[]];  // [serverLines, localLines]
}

type DiffHunk = SimpleDiffHunk | ModifiedDiffHunk;
```

**Example Usage:**

```typescript
import { createClient, type ObjectContent } from 'catalyst-relay';

const client = createClient({
    host: 'https://sap-server.example.com',
    port: 443,
    auth: { type: 'basic', username: 'DEVELOPER', password: 'password123' }
});

const objects: ObjectContent[] = [
    {
        name: 'ZTEST_VIEW',
        extension: 'asddls',
        content: `@AbapCatalog.viewEnhancementCategory: [#NONE]
define view ZTEST_VIEW as select from mara {
  key matnr,
  mtart,
  matkl
}`
    }
];

const [diffs, err] = await client.gitDiff(objects);

if (err) {
    console.error('Diff failed:', err.message);
    return;
}

// Process diff results
for (const diff of diffs) {
    if (diff.diffs.length === 0) {
        console.log(`${diff.name}: No changes`);
    } else {
        console.log(`${diff.name}: ${diff.diffs.length} change(s)`);
        for (const hunk of diff.diffs) {
            console.log(`  ${hunk.type} at line ${hunk.localStart}`);
        }
    }
}
```

**Checking for specific change types:**

```typescript
const [diffs, err] = await client.gitDiff(objects);
if (err) throw err;

for (const diff of diffs) {
    for (const hunk of diff.diffs) {
        if (hunk.type === 'addition') {
            console.log(`Added ${hunk.length} lines at ${hunk.localStart}:`);
            console.log(hunk.changes.join('\n'));
        } else if (hunk.type === 'deletion') {
            console.log(`Deleted ${hunk.length} lines at ${hunk.localStart}:`);
            console.log(hunk.changes.join('\n'));
        } else if (hunk.type === 'modification') {
            const [serverLines, localLines] = hunk.changes;
            console.log(`Modified ${hunk.length} lines at ${hunk.localStart}:`);
            console.log('Server version:', serverLines.join('\n'));
            console.log('Local version:', localLines.join('\n'));
        }
    }
}
```

**Error Handling:**

```typescript
const [diffs, err] = await client.gitDiff(objects);

if (err) {
    // Object doesn't exist on server
    if (err.message.includes('not found')) {
        console.error('Object does not exist on server');
        return;
    }

    // Other errors
    console.error('Diff operation failed:', err.message);
    return;
}

// Process successful result
console.log(`Successfully compared ${diffs.length} object(s)`);
```

---

*Last updated: v0.4.5*
