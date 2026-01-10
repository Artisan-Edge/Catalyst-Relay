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

export type Result<T, E extends Error = Error> = [T, null] | [null, E];

/**
 * Async result type alias for convenience
 */
export type AsyncResult<T, E extends Error = Error> = Promise<Result<T, E>>;

/**
 * Create a success result
 */
export function ok<T>(value: T): Result<T, never> {
    return [value, null];
}

/**
 * Create an error result
 */
export function err<E extends Error = Error>(error: E): Result<never, E> {
    return [null, error];
}

export function resolveAll<T, E extends Error = Error>(results: Result<T, E>[]): Result<T[], AggregateError> {
    const [successes, errors]: [T[], E[]] = [[], []];
    for (const [val, err] of results) {
        if (err !== null) {
            errors.push(err);
            continue;
        }
        successes.push(val!);
    }
    if (errors.length) {
        const messages = errors.map((e, i) => `[${i + 1}] ${e.message}`).join('\n');
        return err(new AggregateError(errors, `Multiple upsert errors:\n${messages}`));
    }
    return ok(successes);
}

export async function resolveAllAsync<T, E extends Error = Error>(resultPromises: AsyncResult<T, E>[]): AsyncResult<T[], AggregateError> {
    const results = await Promise.all(resultPromises);
    return resolveAll(results);
}