# Testing

How to run tests in Catalyst-Relay.

## Sections

- [Running Unit Tests](#running-unit-tests)
- [Node.js Compatibility](#nodejs-compatibility)
- [Running Integration Tests](#running-integration-tests)
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
1. Ask the user to run: `./test.bat <SAP_PASSWORD>`
2. Wait for them to confirm the tests have completed
3. Read `test.output` to see the results

The test.bat script:
- Runs unit tests first (no credentials needed)
- Runs all integration tests if password is provided
- Saves integration test output to `test.output`

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
