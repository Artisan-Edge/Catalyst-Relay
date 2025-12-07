/**
 * Internal utilities
 *
 * Shared helpers for core module:
 * - XML parsing (secure)
 * - URL building
 * - SQL validation
 * - CSRF token handling
 */

export {
    parseXml,
    extractLockHandle,
    extractError,
    escapeXml,
    dictToAbapXml
} from './xml';

export { buildUrl, joinPath } from './url';

export { validateSqlInput, SqlValidationError } from './sql';

export { FETCH_CSRF_TOKEN, CSRF_TOKEN_HEADER } from './csrf';

export {
    BASE_HEADERS,
    DEFAULT_TIMEOUT,
    buildRequestHeaders,
    extractCsrfToken
} from './headers';

export {
    activateLogging,
    deactivateLogging,
    isLoggingActive,
    debug,
    debugError
} from './logging';
