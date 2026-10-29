/**
 * Bounded concurrency for per-object ADT requests
 */

import type { AsyncResult, Result } from '../../types/result';
import { ok, err } from '../../types/result';

/**
 * Requests one operation keeps in flight at once on one session
 *
 * SAP serves a stateful session's requests largely in turn, so a wider fan-out mostly queues on
 * the server, where the time counts against each request's timeout.
 */
export const ADT_CONCURRENCY = 8;

/**
 * Map `fn` over `items` with at most `limit` calls in flight
 *
 * Every item runs; results keep input order. Fails with the first error in input order, so callers
 * that used to stop at the first failing item report the same one.
 *
 * @param items - Items to process
 * @param fn - Per-item operation
 * @param limit - Maximum calls in flight
 * @returns Results in input order, or the first error
 */
export async function mapLimited<T, R>(items: readonly T[], fn: (item: T) => AsyncResult<R, Error>, limit: number = ADT_CONCURRENCY): AsyncResult<R[], Error> {
    const results = new Array<Result<R, Error>>(items.length);
    let next = 0;

    // Each worker takes the next unclaimed index until none are left
    const worker = async (): Promise<void> => {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index]!);
        }
    };
    await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));

    const values: R[] = [];
    for (const result of results) {
        if (result[1] !== null) return err(result[1]);
        values.push(result[0]);
    }
    return ok(values);
}
