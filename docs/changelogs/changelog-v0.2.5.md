# Changelog - v0.2.5

## Release Date
December 16, 2025

## Overview
This release prevents redundant object updates during upsert operations and adds package filtering to reduce payload sizes when querying packages.

## Business Impact

### Smart Upsert: Skip Unchanged Objects
The `upsert()` method now compares local content against the server version before performing an update. If the content is semantically identical (whitespace differences ignored), the object is marked as `unchanged` and no update occurs.

**What this fixes:**
- **No more redundant transport entries** - Previously, every upsert would add an entry to the transport request even if the object hadn't changed
- **No unnecessary activation required** - Unchanged objects no longer need to be mass-activated, saving time and reducing risk
- **Reduced HTTP overhead** - Fewer lock/update/unlock cycles when syncing unchanged objects

**Response behavior:**
```json
{
    "name": "ZSNAP_MY_VIEW",
    "extension": "asddls",
    "status": "unchanged",
    "transport": "NPLK900123"
}
```

Objects with actual changes continue to return `"status": "created"` or `"status": "updated"` as before.

### Package Filtering for Performance
The `/packages` endpoint and `getPackages()` method now accept an optional filter pattern, reducing payload sizes when only specific packages are needed.

**Server mode:**
```
GET /packages?filter=Z*
GET /packages?filter=$TMP
GET /packages?filter=ZSNAP*
```

**Library mode:**
```typescript
const [packages] = await client.getPackages('Z*');      // Custom packages
const [packages] = await client.getPackages('$TMP');    // Local objects only
const [packages] = await client.getPackages('ZSNAP*'); // Specific prefix
```

The default behavior (`*`) remains unchanged for backwards compatibility.

## Technical Details

### Content Normalization Utility
Added `normalizeContent()` utility that collapses all whitespace (spaces, tabs, newlines, carriage returns) into single spaces before comparison. This handles SAP ADT's tendency to insert or modify whitespace during object retrieval.

```typescript
// Internal utility - not exported
normalizeContent("line1\r\n  line2") === "line1 line2"
```

### Bun TLS Compatibility Fix
Added Bun-specific TLS bypass handling when `insecure: true` is configured. Bun ignores the undici dispatcher, so a separate `tls: { rejectUnauthorized: false }` option is now passed to fetch requests.

### Test Updates
- Added integration test for `unchanged` status on content-identical upserts
- Added unit tests for `normalizeContent()` utility
- Updated discovery workflow tests for new filter parameter

## Commits Included
- `f73d4c8` - [UPDATE] Don't do redundant upserts, and enable filtering on the package stuff
- `6d2610d` - [HOTFIX] Updating some of the tests
