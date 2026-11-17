# Changelog - v0.12.1

## Release Date

November 17, 2026

## Overview

The dev dependency `playwright` moves from `^1.49.0` to `^1.65.1` (`bun.lock` from 1.57.0 to 1.65.1). No source code changes. The optional peer dependency range (`^1.40.0`) is unchanged, so consumers are not forced to upgrade.

## Breaking Changes

None.

## What's New

Nothing for library or server consumers. Playwright is only used for SAML browser logins, and consumers keep supplying their own copy through the optional peer dependency.

SAML browser logins have not been exercised against a real SAML system on Playwright 1.65.1.

## Technical Details

- `package.json`: `devDependencies.playwright` `^1.49.0` -> `^1.65.1`.
- `bun.lock`: `playwright` and `playwright-core` 1.57.0 -> 1.65.1. The lockfile's `fsevents` entry is now 2.3.3 (was 2.3.2) because Playwright 1.65.1 no longer lists `fsevents` as an optional dependency, and the separate `rollup/fsevents` entry was removed.
- Per the commit message, 1.65.1 is the version the pinned Catalyst builds resolve.

## Commits Included

- 022b8b6 - [UPDATE] playwright 1.65.1
