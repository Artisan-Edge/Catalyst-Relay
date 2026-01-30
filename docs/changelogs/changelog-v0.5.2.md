# Changelog - v0.5.2

## Release Date
January 29, 2026

## Overview
Adds support for ABAP structure objects (`.astablds`) and exports logging control functions for library consumers.

## Breaking Changes
None.

## What's New

### Structure Object Support

Catalyst-Relay now supports ABAP structure definitions (`define structure`) as a new object type:

```typescript
// Read a structure
const [objects, err] = await client.read([
    { name: 'RBDRSEG_DT', extension: 'astablds' }
]);

// Create a structure
const [, err] = await client.create({
    name: 'ZMYSTRUCTURE',
    extension: 'astablds',
    content: `@EndUserText.label : 'My Structure'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
define structure zmystructure {
  field1 : abap.char(10);
  field2 : abap.int4;
}`,
    description: 'Custom structure',
}, packageName, transport);
```

Configuration:
- Extension: `astablds`
- ADT Type: `STRU/D`
- Endpoint: `ddic/structures`

### Exported Logging Controls

Library consumers can now enable/disable debug logging:

```typescript
import { activateLogging, deactivateLogging } from 'catalyst-relay';

// Enable debug output
activateLogging();

// Disable debug output
deactivateLogging();
```

### Improved Session Import for CLI Usage

Session import (`importSessionState`) now:
- Fetches a fresh CSRF token instead of reusing the cached one (fixes cross-process token issues)
- Calls `timer.unref()` on auto-refresh timers so CLI commands can exit naturally after completing work
- Includes detailed debug logging for troubleshooting session restoration

## Technical Details

### Files Changed

**Modified:**
- `src/core/adt/types.ts` - Added `astablds` to `ConfiguredExtension`, added `STRUCTURE` to `ObjectTypeLabel`, added structure config to `OBJECT_CONFIG_MAP`
- `src/index.ts` - Exported `activateLogging` and `deactivateLogging`
- `src/client/methods/session/importSessionState.ts` - Fetch fresh CSRF token on import, added debug logging
- `src/client/methods/internal/autoRefresh.ts` - Added `timer.unref()` to prevent blocking process exit
- `src/__tests__/index.test.ts` - Added structure configuration tests, updated extension/type counts

**Added:**
- `src/__tests__/integration/structure-workflow.test.ts` - Integration tests for reading existing SAP structures

### New Object Configuration

```typescript
'astablds': {
    endpoint: 'ddic/structures',
    nameSpace: 'xmlns:blue="http://www.sap.com/wbobj/blue"',
    rootName: 'blue:blueSource',
    type: 'STRU/D',
    label: 'Structure',
    extension: 'astablds',
}
```

## Commits Included
- 18157e7 - [UPDATE] Export adding logging
- 1cb48f7 - [UPDATE] Adding support for structure files
