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

export function resolveAll<T, E = Error>(results: Result<T, E>[]): [T[], E[]] {
    const [successes, errors]: [T[], E[]] = [[], []];
    for (const [val, err] of results) {
        if (err !== null) {
            errors.push(err);
            continue;
        }
        successes.push(val!);
    }
    return [successes, errors];
}

export async function resolveAllAsync<T, E = Error>(resultPromises: AsyncResult<T, E>[]): Promise<[T[], E[]]> {
    const results = await Promise.all(resultPromises);
    return resolveAll(results);
}