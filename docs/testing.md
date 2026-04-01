# Testing

How to run tests in Catalyst-Relay.

## Sections

- [Running Unit Tests](#running-unit-tests)
- [Node.js Compatibility](#nodejs-compatibility)
- [Running Integration Tests](#running-integration-tests)
- [Credentials](#credentials)
- [Environment Variables](#environment-variables)
- [Integration Test Workflows](#integration-test-workflows)

---

## Running Unit Tests

```bash
bun test                      # All tests
bun test --watch              # Watch mode
bun test src/__tests__/core   # Specific directory
```

---

## Node.js Compatibility

Test library imports in Node before publishing:

```bash
node --experimental-strip-types -e "import('.')"
```

---

## Running Integration Tests

Integration tests connect to a live SAP system and require credentials (see [Credentials](#credentials) below).

**Quick start (keyring):**
```bash
bun test
```

**Quick start (explicit password):**
```bash
./test.bat <SAP_PASSWORD>
```

**Using `test.bat`:**
1. Runs unit tests first (no credentials needed)
2. Runs all integration tests
3. Saves integration test output to `test.output`

You can also run integration tests directly:
```bash
bun test src/__tests__/integration/                         # All integration tests
bun test src/__tests__/integration/discovery-workflow.test.ts  # Single workflow
```

---

## Credentials

Integration tests need SAP credentials. There are two ways to provide them:

### Option 1: OS Keyring (Recommended)

If you use [Catalyst-CLI](../README.md) and have already logged into the target system, your credentials are stored in the OS keyring. The test suite can read them automatically.

**Setup:**
1. Log in via the CLI: `catalyst adt login TKO-DS4`
2. Set `SAP_TEST_SYSTEM_ALIAS` in your `.env` file to match the system alias:
   ```
   SAP_TEST_SYSTEM_ALIAS="TKO-DS4"
   ```
3. Run tests — no password argument needed: `bun test`

The test helpers look up credentials from the OS keyring using the same service (`Catalyst-CLI`) and key format (`{alias}:basic:password`) that the CLI uses. If `SAP_PASSWORD` is also set as an env var, it takes priority over the keyring.

### Option 2: Environment Variable

Set `SAP_PASSWORD` directly:
```bash
# Via test.bat argument
./test.bat MyPassword123

# Or export it
export SAP_PASSWORD=MyPassword123
bun test
```

---

## Environment Variables

Configured in `.env` (see `.env.templ` for a template).

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `SAP_TEST_ADT_URL` | Yes | SAP ADT server URL | `https://hostname:port` |
| `SAP_TEST_CLIENT` | Yes | SAP client number | `100` |
| `SAP_TEST_USERNAME` | Yes | SAP username | `USERABC` |
| `SAP_TEST_SYSTEM_ALIAS` | No | System alias for keyring lookup | `TKO-DS4` |
| `SAP_PASSWORD` | No* | SAP password | - |
| `SAP_TEST_PACKAGE` | No | Target package (default: `$TMP`) | `$TMP` |
| `SAP_TEST_TRANSPORT` | No | Transport request | `DEVK900123` |

\* `SAP_PASSWORD` is required unless `SAP_TEST_SYSTEM_ALIAS` is set and credentials exist in the OS keyring.

---

## Integration Test Workflows

| Test File | Coverage |
|-----------|----------|
| `cds-workflow.test.ts` | CDS View + Access Control lifecycle |
| `abap-class-workflow.test.ts` | ABAP Class CRAUD |
| `abap-program-workflow.test.ts` | ABAP Program CRAUD |
| `table-workflow.test.ts` | Table + data preview |
| `discovery-workflow.test.ts` | Packages, tree, transports |
| `search-workflow.test.ts` | Search + where-used |
| `data-preview-workflow.test.ts` | Preview on T000 table |
| `upsert-workflow.test.ts` | Create vs update detection |

---

*Last updated: v0.5.2*
