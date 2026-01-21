# Changelog - v0.4.6

## Release Date
January 20, 2026

## Overview
Adds HTTP redirect support and fixes COUNT/DISTINCT queries failing on newer SAP systems by using the freestyle data preview endpoint.

## Breaking Changes
None.

## What's New

### HTTP Redirect Support

The ADT client now automatically follows HTTP redirects (301, 302, 303, 307, 308). This fixes connectivity issues with SAP environments that use load balancers or proxies that redirect requests.

- Supports up to 5 consecutive redirects before failing
- Correctly handles 303 redirects by switching to GET method
- Preserves the original method and body for 307/308 redirects
- Works with both HTTP and HTTPS endpoints

### Freestyle Endpoint for Aggregate Queries

The `countRows` and `getDistinctValues` functions now use the `/sap/bc/adt/datapreview/freestyle` endpoint instead of the standard table/view data preview endpoint. This fixes failures on newer SAP systems where COUNT(*) queries didn't work through the CDS view or table data preview routes.

This change is transparent to API consumers — the function signatures remain unchanged.

## Technical Details

### HTTP Request Changes

- Renamed `httpsRequest` to `httpRequest` to reflect support for both HTTP and HTTPS
- Added `http` module import alongside `https`
- Introduced `MAX_REDIRECTS` constant (5) and `REDIRECT_STATUSES` set
- Recursive redirect handling with proper method/body preservation per HTTP spec

### New Freestyle Query Function

Added `freestyleQuery` in `src/core/adt/data_extraction/freestyle.ts`:
- Executes arbitrary OpenSQL via the freestyle endpoint
- Supports full OpenSQL including COUNT(*), GROUP BY, JOINs
- Used internally by `countRows` and `getDistinctValues`

### Files Changed

- `src/core/client.ts` - Added redirect handling, HTTP support
- `src/core/adt/data_extraction/freestyle.ts` - New file for freestyle queries
- `src/core/adt/data_extraction/count.ts` - Now uses freestyleQuery
- `src/core/adt/data_extraction/distinct.ts` - Now uses freestyleQuery

## Commits Included
- b0c7d8f - [UPDATE] Using the freestyle data preview route for distinct values and count rows
- 03287a5 - [UPDATE] Adding redirect support
