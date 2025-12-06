# Code Smells & Anti-Patterns

Patterns to avoid in Catalyst-Relay. Each section shows BAD code followed by GOOD code.

## Sections

### Project-Specific
- [Nested Conditionals](#nested-conditionals)
- [Try-Catch Soup](#try-catch-soup)
- [Bun-Specific APIs](#bun-specific-apis)
- [Inline Type Imports](#inline-type-imports)
- [God Files](#god-files)
- [Bloated types.ts](#bloated-typests)
- [Colocated Schema Drift](#colocated-schema-drift)
- [Circular Dependencies](#circular-dependencies)

### General TypeScript
- [Any Abuse](#any-abuse)
- [Non-Exhaustive Switches](#non-exhaustive-switches)
- [Unsafe Type Assertions](#unsafe-type-assertions)
- [Magic Values](#magic-values)
- [Callback Hell](#callback-hell)
- [Parameter Mutation](#parameter-mutation)

---

## Nested Conditionals

Use guard clauses (early returns) instead of nested if statements. Violations are called out immediately.

```typescript
// BAD
function processData(data: Data | null) {
    if (data) {
        if (data.items.length > 0) {
            if (data.isValid) {
                // actual logic buried 3 levels deep
                return transform(data);
            }
        }
    }
    return null;
}
```

```typescript
// GOOD
function processData(data: Data | null) {
    if (!data) return null;
    if (data.items.length === 0) return null;
    if (!data.isValid) return null;

    // actual logic at base indentation
    return transform(data);
}
```

---

## Try-Catch Soup

Use Go-style error tuples `[result, error]` instead of try/catch blocks. Forces explicit error handling.

```typescript
// BAD
async function fetchUser(id: string) {
    try {
        const response = await fetch(`/users/${id}`);
        try {
            const data = await response.json();
            try {
                return validateUser(data);
            } catch (e) {
                throw new Error('Invalid user data');
            }
        } catch (e) {
            throw new Error('Failed to parse response');
        }
    } catch (e) {
        throw new Error('Failed to fetch user');
    }
}
```

```typescript
// GOOD
type Result<T, E = Error> = [T, null] | [null, E];

async function fetchUser(id: string): Promise<Result<User>> {
    const response = await fetch(`/users/${id}`);
    if (!response.ok) return [null, new Error('Failed to fetch user')];

    const data = await response.json();
    const [user, validationError] = validateUser(data);
    if (validationError) return [null, validationError];

    return [user, null];
}

// Usage - caller must handle error explicitly
const [user, error] = await fetchUser('123');
if (error) {
    console.error('Failed:', error);
    return;
}
// user is guaranteed non-null here
```

---

## Bun-Specific APIs

Never use Bun runtime APIs. Library consumers may run on Node.js.

```typescript
// BAD - Bun-specific
import { file } from 'bun';

const config = await Bun.file('./config.json').json();
Bun.write('./output.txt', data);
Bun.serve({ port: 3000, fetch: handler });
```

```typescript
// GOOD - Web standard / cross-platform
import { readFile, writeFile } from 'node:fs/promises';

const config = JSON.parse(await readFile('./config.json', 'utf-8'));
await writeFile('./output.txt', data);

// Use Hono for server (works on Bun, Node, Deno, etc.)
import { Hono } from 'hono';
const app = new Hono();
```

---

## Inline Type Imports

Never use inline imports for type assertions. Import types at the top of the file.

```typescript
// BAD - ugly and unreadable
const config = data as import('../types').ClientConfig;
const result = response as import('./responses').ApiResponse;
```

```typescript
// GOOD - clean imports at top
import type { ClientConfig } from '../types';
import type { ApiResponse } from './responses';

const config = data as ClientConfig;
const result = response as ApiResponse;
```

---

## God Files

Each file in `core/` should export one primary function. Split large files.

```typescript
// BAD - core/adt.ts with everything
export function readObject() { ... }
export function createObject() { ... }
export function updateObject() { ... }
export function deleteObject() { ... }
export function lockObject() { ... }
export function unlockObject() { ... }
export function activateObjects() { ... }
// 500+ lines in one file
```

```
// GOOD - one function per file
core/adt/
├── index.ts          # Barrel exports
├── types.ts          # Shared types only
├── read.ts           → readObject()
├── create.ts         → createObject()
├── update.ts         → updateObject()
├── delete.ts         → deleteObject()
├── lock.ts           → lockObject(), unlockObject()  # exception: tightly coupled
└── activation.ts     → activateObjects()
```

---

## Bloated types.ts

Package `types.ts` should only contain types used in multiple files. Single-use types stay in their file.

**Key rule:** If a type is only returned by one function, it lives in that function's file.

```typescript
// BAD - types.ts with everything
// core/adt/types.ts
export interface AdtRequestor { ... }           // used by 5 files - OK
export interface ObjectConfig { ... }           // used by 3 files - OK
export interface VirtualFolder { ... }          // only used in tree.ts - WRONG
export interface TreeDiscoveryQuery { ... }     // only used in tree.ts - WRONG
export interface ActivationResult { ... }       // only returned by activateObjects() - WRONG
```

```typescript
// GOOD - types stay where they're used

// core/adt/types.ts - only multi-file types
export interface AdtRequestor { ... }
export interface ObjectConfig { ... }

// core/adt/tree.ts - colocated with getTree()
interface VirtualFolder { ... }           // internal helper type
interface TreeDiscoveryQuery { ... }      // internal helper type
export interface TreeNode { ... }         // return type of getTree()

// core/adt/activation.ts - colocated with activateObjects()
export interface ActivationResult { ... } // return type of activateObjects()
export interface ActivationMessage { ... }
```

Export return types from the function's file, then re-export from the barrel (`index.ts`) for public API.

---

## Colocated Schema Drift

Zod schemas must live in the same file as their route handler. Never in separate schema files.

```typescript
// BAD - schemas separated from handlers
// server/schemas/auth.ts
export const loginSchema = z.object({ ... });

// server/routes/auth/login.ts
import { loginSchema } from '../../schemas/auth';
export function loginHandler() { ... }
```

```typescript
// GOOD - schema colocated with handler
// server/routes/auth/login.ts
import { z } from 'zod';

// Schema right here
export const loginRequestSchema = z.object({
    username: z.string(),
    password: z.string(),
});

// Handler uses it directly
export function loginHandler(sessionManager: ISessionManager) {
    return async (c: Context) => {
        const validation = loginRequestSchema.safeParse(await c.req.json());
        // ...
    };
}
```

---

## Circular Dependencies

Files must have a clear import hierarchy. Never import from a file that imports you.

```typescript
// BAD - circular import
// core/client.ts
import { createSession } from './session';  // session imports client!
export function createClient() { ... }

// core/session.ts
import { createClient } from './client';    // client imports session!
export function createSession() { ... }
```

```typescript
// GOOD - clear hierarchy
// types.ts (no imports from package)
export interface ClientConfig { ... }
export interface SessionConfig { ... }

// helpers.ts (imports only types)
import type { ClientConfig } from './types';

// client.ts (imports types and helpers)
import type { ClientConfig } from './types';
import { buildUrl } from './helpers';

// session.ts (imports types, helpers, and client)
import type { SessionConfig } from './types';
import { createClient } from './client';

// index.ts (imports from all - barrel only)
export * from './client';
export * from './session';
```

---

## Any Abuse

Never use `any`. Use `unknown` for truly unknown types, then narrow.

```typescript
// BAD
function parseResponse(data: any) {
    return data.users.map((u: any) => u.name);  // runtime bomb
}

async function fetchData(): Promise<any> {
    const res = await fetch('/api');
    return res.json();  // caller has no idea what they get
}
```

```typescript
// GOOD
interface User {
    id: string;
    name: string;
}

interface ApiResponse {
    users: User[];
}

function parseResponse(data: unknown): string[] {
    if (!isApiResponse(data)) throw new Error('Invalid response');
    return data.users.map(u => u.name);
}

// Type guard
function isApiResponse(data: unknown): data is ApiResponse {
    return (
        typeof data === 'object' &&
        data !== null &&
        'users' in data &&
        Array.isArray(data.users)
    );
}
```

---

## Non-Exhaustive Switches

Always handle all cases in discriminated unions. Use `never` to catch missing cases.

```typescript
// BAD - missing case silently ignored
type Status = 'pending' | 'active' | 'completed' | 'failed';

function getStatusColor(status: Status): string {
    switch (status) {
        case 'pending': return 'yellow';
        case 'active': return 'blue';
        case 'completed': return 'green';
        // 'failed' silently returns undefined!
    }
}
```

```typescript
// GOOD - exhaustive with never check
type Status = 'pending' | 'active' | 'completed' | 'failed';

function getStatusColor(status: Status): string {
    switch (status) {
        case 'pending': return 'yellow';
        case 'active': return 'blue';
        case 'completed': return 'green';
        case 'failed': return 'red';
        default: {
            const _exhaustive: never = status;
            throw new Error(`Unhandled status: ${_exhaustive}`);
        }
    }
}
```

---

## Unsafe Type Assertions

Don't use `as` without validation. Validate first, then the type is guaranteed.

```typescript
// BAD - trusting external data
const config = JSON.parse(rawJson) as ClientConfig;  // could be anything
const user = apiResponse.data as User;               // no validation
```

```typescript
// GOOD - validate then use
import { z } from 'zod';

const clientConfigSchema = z.object({
    url: z.string().url(),
    timeout: z.number().optional(),
});

const parsed = clientConfigSchema.safeParse(JSON.parse(rawJson));
if (!parsed.success) {
    return [null, new Error('Invalid config')];
}
const config = parsed.data;  // type is inferred, no assertion needed
```

---

## Magic Values

Extract hardcoded values into named constants.

```typescript
// BAD - magic numbers and strings
if (retryCount > 3) { ... }
if (response.status === 440) { ... }
const timeout = setTimeout(fn, 30000);
if (type === 'CSRF_TOKEN_EXPIRED') { ... }
```

```typescript
// GOOD - named constants
const MAX_RETRIES = 3;
const SESSION_EXPIRED_STATUS = 440;
const DEFAULT_TIMEOUT_MS = 30_000;
const ErrorCodes = {
    CSRF_TOKEN_EXPIRED: 'CSRF_TOKEN_EXPIRED',
    SESSION_INVALID: 'SESSION_INVALID',
} as const;

if (retryCount > MAX_RETRIES) { ... }
if (response.status === SESSION_EXPIRED_STATUS) { ... }
const timeout = setTimeout(fn, DEFAULT_TIMEOUT_MS);
if (type === ErrorCodes.CSRF_TOKEN_EXPIRED) { ... }
```

---

## Callback Hell

Use async/await instead of nested callbacks or promise chains.

```typescript
// BAD - callback pyramid
function processUser(id: string, callback: (err: Error | null, result?: User) => void) {
    fetchUser(id, (err, user) => {
        if (err) return callback(err);
        validateUser(user, (err, valid) => {
            if (err) return callback(err);
            enrichUser(valid, (err, enriched) => {
                if (err) return callback(err);
                callback(null, enriched);
            });
        });
    });
}
```

```typescript
// GOOD - async/await with error tuples
async function processUser(id: string): Promise<Result<User>> {
    const [user, fetchError] = await fetchUser(id);
    if (fetchError) return [null, fetchError];

    const [valid, validateError] = await validateUser(user);
    if (validateError) return [null, validateError];

    const [enriched, enrichError] = await enrichUser(valid);
    if (enrichError) return [null, enrichError];

    return [enriched, null];
}
```

---

## Parameter Mutation

Never modify function parameters. Return new values instead.

```typescript
// BAD - mutating input
function addTimestamp(request: Request): void {
    request.timestamp = Date.now();      // mutates caller's object
    request.headers.push('X-Time: now'); // mutates nested array
}

function normalizeUsers(users: User[]): void {
    users.forEach(u => {
        u.name = u.name.trim();  // mutates each user
    });
    users.sort((a, b) => a.id - b.id);  // mutates array order
}
```

```typescript
// GOOD - return new values
function addTimestamp(request: Request): Request {
    return {
        ...request,
        timestamp: Date.now(),
        headers: [...request.headers, 'X-Time: now'],
    };
}

function normalizeUsers(users: readonly User[]): User[] {
    return users
        .map(u => ({ ...u, name: u.name.trim() }))
        .sort((a, b) => a.id - b.id);  // sort on new array
}
```
