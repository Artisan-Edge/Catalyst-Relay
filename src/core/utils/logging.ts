/**
 * Logging Utility — Debug logging with activation control
 *
 * Logs are silent by default. Call activateLogging() to enable console output.
 */

let isActive = false;

/**
 * Enable debug logging to console
 */
export function activateLogging(): void {
    isActive = true;
}

/**
 * Disable debug logging (default state)
 */
export function deactivateLogging(): void {
    isActive = false;
}

/**
 * Check if logging is currently active
 */
export function isLoggingActive(): boolean {
    return isActive;
}

/**
 * Log a debug message (only prints when logging is active)
 */
export function debug(message: string): void {
    if (isActive) {
        console.log(`[DEBUG] ${message}`);
    }
}

/**
 * Log a debug error message (only prints when logging is active)
 */
export function debugError(message: string, cause?: unknown): void {
    if (!isActive) return;

    console.error(`[DEBUG] ${message}`);
    if (cause !== undefined) {
        console.error(`[DEBUG] Cause:`, cause);
    }
}
