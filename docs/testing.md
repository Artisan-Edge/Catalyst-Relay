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

Unit tests are hermetic: no SAP system, network or Kerberos (mock requestors and captured fixtures).

```bash
bun run test                  # Unit set: src/__tests__/core, client, index.test.ts
bun run test:unit             # Same
bun test                      # Same (bunfig.toml ignores src/__tests__/integration)
bun test --watch              # Watch mode
bun test src/__tests__/core   # Specific directory
```

Fixtures under `src/__tests__/fixtures/` must be committed (`.gitignore` re-includes `fixtures/**/*.xml`); the text element fixtures are kept byte-for-byte (CRLF) by `.gitattributes`.

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
bun run test:integration
```

**Quick start (explicit password):**

```bash
./test.bat <SAP_PASSWORD>
```

**Using `test.bat`:**

1. Runs unit tests first (`bun run test:unit`, no credentials needed)
2. Runs all integration tests (`bun run test:integration`)
3. Saves integration test output to `test.output`

You can also run integration tests directly:

```bash
bun run test:integration                                                                       # All integration tests
bun test --path-ignore-patterns=node_modules/** src/__tests__/integration/discovery-workflow.test.ts  # Single workflow
```

`bunfig.toml` excludes the integration folder from a bare `bun test`; `--path-ignore-patterns=…` replaces that exclusion, so name the integration files explicitly.

Integration tests write to SAP; they use unique names (`generateTestName`, or `ZCAT_IT_<stamp>` in the newer suites) and delete what they create in `afterAll`, whatever the tests did. `deleteExisting(refs)` does that in a fresh session, since a failed write can leave the test session holding a lock that blocks the delete. `sso-workflow.test.ts` needs a domain-joined machine and the corporate SLS server.

Creates need a `description` (SAP refuses an include without a title and a table without a description); message classes, lock objects and data elements take theirs from the source.

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
3. Run tests — no password argument needed: `bun run test:integration`

The test helpers look up credentials from the OS keyring using the same service (`Catalyst-CLI`) and key format (`{alias}:basic:password`) that the CLI uses. If `SAP_PASSWORD` is also set as an env var, it takes priority over the keyring.

### Option 2: Environment Variable

Set `SAP_PASSWORD` directly:

```bash
# Via test.bat argument
./test.bat MyPassword123

# Or export it
export SAP_PASSWORD=MyPassword123
bun run test:integration
```

---

## Environment Variables

Configured in `.env` (see `.env.templ` for a template).

| Variable                | Required | Description                      | Example                 |
| ----------------------- | -------- | -------------------------------- | ----------------------- |
| `SAP_TEST_ADT_URL`      | Yes      | SAP ADT server URL               | `https://hostname:port` |
| `SAP_TEST_CLIENT`       | Yes      | SAP client number                | `100`                   |
| `SAP_TEST_USERNAME`     | Yes      | SAP username                     | `USERABC`               |
| `SAP_TEST_SYSTEM_ALIAS` | No       | System alias for keyring lookup  | `TKO-DS4`               |
| `SAP_PASSWORD`          | No*      | SAP password                     | -                       |
| `SAP_TEST_PACKAGE`      | No       | Target package (default: `$TMP`) | `$TMP`                  |
| `SAP_TEST_TRANSPORT`    | No       | Transport request                | `DEVK900123`            |

\* `SAP_PASSWORD` is required unless `SAP_TEST_SYSTEM_ALIAS` is set and credentials exist in the OS keyring.

---

## Integration Test Workflows

| Test File                              | Coverage                                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `cds-workflow.test.ts`                 | CDS View + Access Control lifecycle                                                                                         |
| `abap-class-workflow.test.ts`          | ABAP Class CRAUD                                                                                                            |
| `abap-program-workflow.test.ts`        | ABAP Program CRAUD                                                                                                          |
| `table-workflow.test.ts`               | Table + data preview                                                                                                        |
| `discovery-workflow.test.ts`           | Packages, tree, transports                                                                                                  |
| `search-workflow.test.ts`              | Search + where-used                                                                                                         |
| `data-preview-workflow.test.ts`        | Preview on T000 table                                                                                                       |
| `structure-workflow.test.ts`           | Structure read workflow                                                                                                     |
| `syntax-check-errors-workflow.test.ts` | Syntax check error detection                                                                                                |
| `upsert-workflow.test.ts`              | Create vs update detection                                                                                                  |
| `msag-workflow.test.ts`                | Message class (`.asmsag`) create, edit, delete, re-create                                                                   |
| `enqu-workflow.test.ts`                | Table + lock object (`.asenqu`) create (populated after create), activate, read back, unchanged, delete both                |
| `function-group-workflow.test.ts`      | Function group with includes and a module: create, activate, unchanged, add an include, delete an include, delete the group |
| `ddic-workflow.test.ts`                | Data elements, domains and conversion routines                                                                              |
| `sso-workflow.test.ts`                 | SSO certificate enrollment and login (Kerberos, SLS)                                                                        |

---

_Last updated: v0.8.0_
