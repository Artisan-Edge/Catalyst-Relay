/**
 * CSRF Token Constants
 *
 * Constants for CSRF token handling with SAP ADT endpoints.
 */

/**
 * Special value to request a CSRF token from the server
 *
 * When sent in the x-csrf-token header, SAP returns a valid token
 * in the response headers.
 */
export const FETCH_CSRF_TOKEN = 'fetch';

/**
 * HTTP header name for CSRF token
 *
 * Used both for requesting tokens (with FETCH_CSRF_TOKEN value)
 * and sending tokens with authenticated requests.
 */
export const CSRF_TOKEN_HEADER = 'x-csrf-token';
