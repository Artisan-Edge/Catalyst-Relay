@echo off
if "%~1"=="" (
    echo Usage: test.bat ^<SAP_PASSWORD^>
    exit /b 1
)

set SAP_PASSWORD=%~1
bun test src/__tests__/integration/cds-workflow.test.ts > test.output 2>&1
type test.output
