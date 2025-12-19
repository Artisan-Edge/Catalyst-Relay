# Lessons Learned

TypeScript gotchas and architecture decisions discovered while building Catalyst-Relay.

## Sections

### TypeScript Gotchas
- [exactOptionalPropertyTypes + Zod](#exactoptionalpropertytypes--zod)
- [process.env Access](#processenv-access)
- [Hono Status Codes](#hono-status-codes)
- [Middleware Return Types](#middleware-return-types)
- [Literal Types in JSON Responses](#literal-types-in-json-responses)

### Architecture Decisions
- [Why Error Tuples?](#why-error-tuples)
- [Why Separate core/ and server/?](#why-separate-core-and-server)
- [Why Config File Lookup?](#why-config-file-lookup)
- [Why One File Per Route?](#why-one-file-per-route)
- [Why One Function Per File (Core)?](#why-one-function-per-file-core)

---

## exactOptionalPropertyTypes + Zod

Zod infers `prop?: string | undefined` but interfaces may expect `prop?: string`. Cast after validation.

```typescript
// BAD - type mismatch with exactOptionalPropertyTypes
const config = schema.parse(body);  // Zod adds | undefined to optional props
```

```typescript
// GOOD - cast to your interface after validation
import type { ClientConfig } from '../types';
const validation = schema.safeParse(body);
const config = validation.data as ClientConfig;
```

---

## process.env Access

Use bracket notation for index signatures with `noUncheckedIndexedAccess`.

```typescript
// BAD - TS error with noUncheckedIndexedAccess
const path = process.env.RELAY_CONFIG;
```

```typescript
// GOOD - bracket notation works
const path = process.env['RELAY_CONFIG'];
```

---

## Hono Status Codes

Hono's `c.json()` only accepts standard HTTP status codes. Non-standard codes like 440 cause TS errors.

```typescript
// BAD - 440 not in ContentfulStatusCode
return c.json({ error: 'Session expired' }, 440);
```

```typescript
// GOOD - use standard code with error code in body
return c.json({ error: 'Session expired', code: 'SESSION_EXPIRED' }, 401);
```

---

## Middleware Return Types

Hono middleware must explicitly return after `await next()`.

```typescript
// BAD - implicit return causes TS error
export const middleware = createMiddleware(async (c, next) => {
    await next();
});
```

```typescript
// GOOD - explicit return
export const middleware = createMiddleware(async (c, next) => {
    await next();
    return;  // Required for TS
});
```

---

## Literal Types in JSON Responses

Use `as const` for discriminated unions in response objects.

```typescript
// BAD - success inferred as boolean, not literal false
return c.json({ success: false, error: msg }, 400);
```

```typescript
// GOOD - literal type preserved
return c.json({ success: false as const, error: msg }, 400);
```

---

## Why Error Tuples?

Go-style `[result, error]` tuples instead of try/catch:

- Forces explicit error handling at call site
- No try/catch soup
- TypeScript narrows types after null check
- Matches Go idiom (familiar pattern)

```typescript
const [client, error] = await createClient(config);
if (error) return handleError(error);
// client is guaranteed non-null here
```

---

## Why Separate core/ and server/?

Clear separation of concerns:

- `core/` = pure functions, testable, library-consumable
- `server/` = HTTP concerns only (routes, middleware)
- Consumers can import `core/` directly without server overhead

---

## Why Config File Lookup?

Matches Python reference behavior:

- Single source of truth for system URLs
- Easy environment switching
- Client ID as simple string identifier

---

## Why One File Per Route?

Inspired by SNAP-API Python project:

- Easy to find/edit specific endpoints
- Colocated schemas prevent drift
- Clear ownership and responsibility
- Minimal merge conflicts

---

## Why One Function Per File (Core)?

Maintainability benefits:

- Clear import hierarchy
- No circular dependency risks
- Easy to test in isolation
- Self-documenting structure
