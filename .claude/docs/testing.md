# Testing

How to run tests in Catalyst-Relay.

## Sections

- [Running Unit Tests](#running-unit-tests)
- [Node.js Compatibility](#nodejs-compatibility)
- [Running Integration Tests](#running-integration-tests)
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

Integration tests require SAP credentials and connect to a live SAP system.

**To run integration tests:**
1. Set the required environment variables (see below)
2. Ask the user to run: `./test.bat <SAP_PASSWORD>`
3. Wait for them to confirm the tests have completed
4. Read `test.output` to see the results

The test.bat script:
- Runs unit tests first (no credentials needed)
- Runs all integration tests if password is provided
- Saves integration test output to `test.output`

---

## Environment Variables

Integration tests require the following environment variables:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `SAP_TEST_ADT_URL` | Yes | SAP ADT server URL | `https://hostname:port` |
| `SAP_TEST_CLIENT` | Yes | SAP client number | `100` |
| `SAP_TEST_USERNAME` | Yes | SAP username | `USERABC` |
| `SAP_PASSWORD` | Yes | SAP password (passed to test.bat) | - |
| `SAP_TEST_PACKAGE` | No | Target package (default: `$TMP`) | `$TMP` |
| `SAP_TEST_TRANSPORT` | No | Transport request | `DEVK900123` |

See `.env.templ` for a template.

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
