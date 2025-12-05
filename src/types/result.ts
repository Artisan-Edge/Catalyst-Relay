/**
 * Result type for error handling (Go-style tuples)
 *
 * Usage:
 * const [data, error] = await someFunction();
 * if (error) {
 *     console.error(error);
 *     return;
 * }
 * // data is guaranteed non-null
 */

export type Result<T, E = Error> = [T, null] | [null, E];

/**
 * Async result type alias for convenience
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

/**
 * Create a success result
 */
export function ok<T>(value: T): Result<T, never> {
    return [value, null];
}

/**
 * Create an error result
 */
export function err<E = Error>(error: E): Result<never, E> {
    return [null, error];
}
