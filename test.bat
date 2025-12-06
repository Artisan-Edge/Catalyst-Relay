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
    echo Usage: test.bat ^<SAP_PASSWORD^> [username] [client_id]
    echo   SAP_PASSWORD  - Required for integration tests
    echo   username      - Optional, defaults to SAP_TEST_USERNAME env var
    echo   client_id     - Optional, defaults to MediaDemo-DM1-200
    echo.
    echo Unit tests completed successfully!
    exit /b 0
)

REM Set environment variables for integration tests
set SAP_PASSWORD=%~1
if not "%~2"=="" set SAP_TEST_USERNAME=%~2
if not "%~3"=="" set SAP_TEST_CLIENT_ID=%~3

echo [2/2] Running integration tests...
echo --------------------------------------------
echo Client: %SAP_TEST_CLIENT_ID%
echo User: %SAP_TEST_USERNAME%
echo.

REM Run all integration tests and save output
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
