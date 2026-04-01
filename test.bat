@echo off
setlocal

echo ============================================
echo Catalyst-Relay Test Suite
echo ============================================
echo.

REM Run unit tests first (no credentials needed)
echo [1/2] Running unit tests...
echo --------------------------------------------
bun test src/__tests__/index.test.ts
if %errorlevel% neq 0 (
    echo.
    echo Unit tests FAILED
    exit /b 1
)
echo.

REM Set password from command line argument if provided
if not "%~1"=="" (
    set SAP_PASSWORD=%~1
)

echo [2/2] Running integration tests...
echo --------------------------------------------
echo Credentials: SAP_PASSWORD env var, or OS keyring via SAP_TEST_SYSTEM_ALIAS
echo.

REM Run all integration tests (bun auto-loads .env)
bun test src/__tests__/integration/ > test.output 2>&1
set TEST_EXIT_CODE=%errorlevel%

REM Display the output
type test.output

if %TEST_EXIT_CODE% neq 0 (
    echo.
    echo Integration tests FAILED
    exit /b 1
)

echo.
echo ============================================
echo All tests completed successfully!
echo Output saved to test.output
echo ============================================

endlocal
