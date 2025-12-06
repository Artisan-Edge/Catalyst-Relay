# API Reference

HTTP endpoints available in Server Mode.

## Sections

- [Session Management](#session-management)
- [Metadata Discovery](#metadata-discovery)
- [CRAUD Operations](#craud-operations)
- [Data Preview](#data-preview)
- [Search](#search)

---

## Session Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/login` | Authenticate, returns session ID |
| DELETE | `/logout` | End session |

---

## Metadata Discovery

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/packages` | List available packages |
| POST | `/tree` | Hierarchical package browser |
| GET | `/transports/:package` | List transports for a package |

---

## CRAUD Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/objects/read` | Batch read with content |
| POST | `/objects/upsert/:package/:transport?` | Create/update objects |
| POST | `/objects/activate` | Activate objects |
| DELETE | `/objects/:transport?` | Delete objects |

---

## Data Preview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/preview/data` | Query table/view data |
| POST | `/preview/distinct` | Distinct column values |
| POST | `/preview/count` | Row count |

---

## Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/search/:query` | Search objects by query |
| POST | `/where-used` | Find dependencies |
