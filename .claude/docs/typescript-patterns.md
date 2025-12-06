# TypeScript Patterns

Conventions for writing TypeScript in Catalyst-Relay.

## Sections

- [Naming Conventions](#naming-conventions)
- [Type Definitions](#type-definitions)
- [Null Handling](#null-handling)
- [Async Patterns](#async-patterns)
- [Import Conventions](#import-conventions)

---

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files/folders | camelCase | `dataPreview.ts`, `authUtils/` |
| Types/Interfaces | PascalCase | `ClientConfig`, `LoginResponse` |
| Functions | camelCase | `createClient`, `fetchData` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES`, `DEFAULT_TIMEOUT` |
| Booleans | is/has/can prefix | `isConnected`, `hasError`, `canRetry` |

---

## Type Definitions

Use interfaces for objects, types for unions/intersections.

```typescript
// Use interfaces for objects
interface ClientConfig {
    url: string;
    auth: AuthConfig;
}

// Use type for unions/intersections
type AuthType = 'basic' | 'saml' | 'sso';
type Result<T> = [T, null] | [null, Error];
```

---

## Null Handling

Prefer guard clauses over optional chaining for error cases.

```typescript
// Optional chaining - good for accessing nested properties
const value = response?.data?.field;

// Nullish coalescing - good for defaults
const timeout = config.timeout ?? DEFAULT_TIMEOUT;

// Guard clause (preferred for error handling)
if (!response) return [null, new Error('No response')];
```

---

## Async Patterns

Use parallel execution for independent operations, sequential for dependent ones.

```typescript
// Parallel when independent
const [users, posts] = await Promise.all([
    fetchUsers(),
    fetchPosts()
]);

// Sequential when dependent
const [session, err1] = await login(credentials);
if (err1) return [null, err1];

const [data, err2] = await fetchData(session);
if (err2) return [null, err2];
```

---

## Import Conventions

Organize imports by category: external, internal namespaces, internal named, types.

```typescript
// External packages
import { Hono } from 'hono';
import { z } from 'zod';

// Internal - namespace for modules
import * as auth from './auth';
import * as adt from './adt';

// Internal - named for specific items
import { ClientConfig, AuthType } from '../types';
import { parseXml, buildUrl } from '../utils';

// Types only
import type { Context } from 'hono';
```
