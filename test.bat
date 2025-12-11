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

REM Check if password provided for integration tests
if "%~1"=="" (
    echo [2/2] Skipping integration tests - no password provided
    echo.
    echo Usage: test.bat ^<SAP_PASSWORD^>
    echo.
    echo Required in .env file:
    echo   SAP_TEST_ADT_URL  - SAP ADT server URL
    echo   SAP_TEST_CLIENT   - SAP client number
    echo   SAP_TEST_USERNAME - SAP username
    echo.
    echo Unit tests completed successfully!
    exit /b 0
)

REM Set password from command line argument
set SAP_PASSWORD=%~1

echo [2/2] Running integration tests...
echo --------------------------------------------

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
