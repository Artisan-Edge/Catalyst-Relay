# Changelog - v0.3.0

## Release Date
January 7, 2026

## Overview
This release adds proper SAML authentication support with separate SAP user identification, fixes the transports endpoint, and reorganizes documentation.

## Breaking Changes

### SAML Configuration Requires `sapUser` Field

SAML authentication now requires a `sapUser` field in addition to `username` and `password`. This is a **breaking change** for existing SAML configurations.

**Why this change?**
SAML identity providers typically use email addresses as usernames, which are tied to generated user IDs. However, SAP systems require the actual SAP username for object attribution (`adtcore:responsible`). The new `sapUser` field provides this mapping.

**Migration:**
```typescript
// Before (v0.2.x)
const config = {
    auth: {
        type: 'saml',
        username: 'user@company.com',
        password: 'secret'
    }
};

// After (v0.3.0)
const config = {
    auth: {
        type: 'saml',
        username: 'user@company.com',  // Used for browser login
        password: 'secret',
        sapUser: 'SAPUSER01'           // SAP system username (required)
    }
};
```

Sessions created with SAML auth now use `sapUser` as the session username, ensuring objects are attributed to the correct SAP user.

## What's New

### SAML Cookie Transfer
SAML authentication cookies are now properly transferred from the auth strategy to the ADT client's cookie store. This ensures authenticated sessions persist correctly after browser-based SAML login.

### Transports Endpoint Fixed
The `/transports/:package` endpoint is now working again. The underlying transport check request was updated to resolve compatibility issues.

### Package Search Optimization
The `getPackages()` function now uses the ADT search API directly (`/sap/bc/adt/repository/informationsystem/search`) instead of fetching the full package tree. This provides more reliable results and better performance for package lookups.

## Technical Details

### SAML Auth Changes
- Added `sapUser` field to `SamlAuthConfig` interface
- Added `getSapUser()` method to `SamlAuth` class
- Added optional `getSapUser()` method to `AuthStrategy` interface
- `extractUsername()` in session login now returns `sapUser` for SAML auth
- Client now transfers SAML cookies to its cookie store after authentication

### Transport Request Changes
- Updated XML request body format for `/sap/bc/adt/cts/transportchecks`
- Simplified `Transport` interface (removed `status` field)
- Made `description` and `owner` fields default to empty strings if not present

### Package Discovery Rewrite
- Replaced tree-based package lookup with direct search API
- Uses `objectType=DEVC/K` parameter to filter for packages only
- Extracts package name and description from `adtcore:objectReference` elements

### Documentation
- Moved documentation from `.claude/docs/` to `docs/`
- Moved changelogs from `.claude/changelogs/` to `docs/changelogs/`
- Added tarballs to `.gitignore`

## Commits Included
- `4f6fe6d` - [UPDATE] Transports work again, not sure what changed really
- `45ba6db` - [UPDATE] Fixing the filtering for package names
- `3ddf500` - [UPDATE] SAML integration. Added sapUser to SAMLAuthConfig and ensured that cookies are transferred to the client.
- `92c062d` - [UPDATE] Moving over the changelogs
- `738871b` - [UPDATE] Updating the location of the docs, and setting up the Claude-Central marketplace
- `53695f4` - [UPDATE] Adding tarballs to the gitignore
