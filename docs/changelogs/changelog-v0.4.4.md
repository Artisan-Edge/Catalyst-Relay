# Changelog - v0.4.4

## Release Date
January 12, 2026

## Overview
Adds automatic session keepalive to prevent timeouts during long-running operations, and simplifies tree object retrieval by returning descriptions directly.

## Breaking Changes

### `ApiState` Type Removed

The `ApiState` interface and related exports have been removed:

```typescript
// v0.4.3 (removed)
export interface ApiState {
    useInCloudDevelopment: boolean;
    useInCloudDvlpmntActive: boolean;
    useInKeyUserApps: boolean;
}

export interface ObjectNode {
    name: string;
    objectType: string;
    extension: string;
    apiState?: ApiState;  // Removed
}

// v0.4.4
export interface ObjectNode {
    name: string;
    objectType: string;
    extension: string;
    description?: string;  // New
}
```

**Migration:** If you were using `apiState` on `ObjectNode`, that data is no longer available. The `description` field now provides the object's text description from SAP.

## What's New

### Automatic Session Refresh

Sessions are now automatically refreshed to prevent timeouts during long-running operations. This uses SAP ADT's reentrance ticket mechanism to extend session lifetime without re-authenticating.

**Default behavior:** Enabled with a 30-minute refresh interval.

```typescript
// Disable auto-refresh
const client = await createClient({
    host: 'sap.example.com',
    auth: { type: 'basic', username: 'user', password: 'pass' },
    autoRefresh: { enabled: false },
});

// Custom interval (refresh every 10 minutes)
const client = await createClient({
    host: 'sap.example.com',
    auth: { type: 'basic', username: 'user', password: 'pass' },
    autoRefresh: { enabled: true, intervalMs: 10 * 60 * 1000 },
});
```

### Manual Session Refresh

A new `refreshSession()` method allows manual session refresh:

```typescript
const [result, err] = await client.refreshSession();
if (err) {
    console.error('Refresh failed:', err.message);
} else {
    console.log('Session expires at:', new Date(result.expiresAt));
}
```

### Server Mode: `/session/refresh` Endpoint

A new HTTP endpoint for session refresh in server mode:

```
POST /session/refresh
Headers: X-Session-ID: <session-id>

Response: {
    "success": true,
    "data": {
        "ticket": "<base64-encoded-ticket>",
        "expiresAt": 1736717400000
    }
}
```

### Object Descriptions in Tree Results

Tree browsing now returns object descriptions when available:

```typescript
const [tree, err] = await client.getTree({ package: 'SFLIGHT', path: 'DICT/DDLS' });
// tree.objects now includes descriptions
// { name: 'I_JOURNALENTRY', objectType: 'Data Definition', extension: 'asddls', description: 'Journal Entry' }
```

## Technical Details

### Session Refresh Implementation

- Calls `/sap/bc/adt/security/reentranceticket` to obtain a reentrance ticket
- Server-side session cookies (MYSAPSSO2) are refreshed automatically
- Timer is started on login and stopped on logout
- New files: `src/core/session/refresh.ts`, `src/server/routes/auth/refresh.ts`

### Simplified Tree Parsing

The virtual folders endpoint now uses an empty `<vfs:facetorder/>` at the object level, which returns objects with their `text` attribute (description) directly. This eliminates the need for parallel API folder fetches and the complex `apiState` merging logic.

**Before:** 4 parallel requests to API folders, merged into `apiState` flags
**After:** 1 request with empty facetorder, `description` extracted from `text` attribute

### New Configuration Type

```typescript
interface AutoRefreshConfig {
    enabled: boolean;
    intervalMs?: number;  // Default: 30 minutes
}
```

## Commits Included
- `ba7064e` - Add auto-refresh session via reentrance ticket
- `2bc36be` - Simplify object retrieval at final level of virtual folders
- `559bde5` - Add test for object descriptions
