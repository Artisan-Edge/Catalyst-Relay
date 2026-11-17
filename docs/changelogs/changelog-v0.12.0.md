# Changelog - v0.12.0

## Release Date

November 17, 2026

## Overview

The client can read a package's settings and check whether an object exists. Catalyst-CLI's `fiori deploy` uses both for the shared launchpad space: to place its package beside the stack package, and to tell a missing space (HTTP 404) from a failed read, so a read failure never turns into a create that would drop other stacks' pages.

## Breaking Changes

None for code that reads the API. `PackageSettings` gains the required field `recordChanges`, so code that builds a `PackageSettings` value itself (for example a test fake) must add it.

## What's New

- **`client.readPackage(packageName)`** returns `PackageSettings` (name, description, super-package, software component, transport layer, package type, change recording), or `null` when the package does not exist.
- **`PackageSettings.recordChanges`**: `true` when the package records changes on transports, `false` for local packages. `parsePackageSettings` and `readPackageSettings` fill it.
- **`client.objectExists(object)`**: `true` when the object exists, `false` on HTTP 404, an error for any other answer (also when its text says "not found"). It reuses the existing core `objectExists`, now exported from the core barrel.

## Technical Details

- New `src/client/methods/packages/readPackage.ts` and `src/client/methods/craud/objectExists.ts`, wired into `ADTClient`. They reuse `readPackageSettings` (`core/adt/packages/createPackage.ts`) and `objectExists` (`core/adt/craud/objectExists.ts`).
- Tests: `readPackageSettings` (missing, existing and failing package), change recording parsed from the captured `ZSNAP_BC` package document, `objectExists` (404, 200, and 500 with "not found" text).
- README: `readPackage` and `objectExists` in the client method table.

## Commits Included

- ede7eca - [UPDATE] client.readPackage (package settings with recordChanges) and client.objectExists (404-based) for the CLI shared launchpad space
