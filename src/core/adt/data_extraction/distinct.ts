/**
 * Distinct Values — Get distinct column values with counts
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { freestyleQuery } from './freestyle';
import { type Parameter, parametersToSQLParams } from './queryBuilder';

/**
 * Distinct values result
 */
export interface DistinctResult {
    column: string;
    values: Array<{
        value: unknown;
        count: number;
    }>;
}

const MAX_ROW_COUNT = 50000;

/**
 * Get distinct values for a column with counts, ordered by count descending
 *
 * Uses the freestyle endpoint which supports COUNT(*) and GROUP BY.
 */
export async function getDistinctValues(
    client: AdtRequestor,
    objectName: string,
    parameters: Parameter[],
    column: string,
    _objectType: 'table' | 'view' = 'view'
): AsyncResult<DistinctResult, Error> {
    const columnName = column.toUpperCase();
    const sqlQuery = `SELECT ${columnName} AS value, COUNT(*) AS value_count FROM ${objectName}${parametersToSQLParams(parameters)} GROUP BY ${columnName} ORDER BY value_count DESCENDING`;

    const [dataFrame, error] = await freestyleQuery(client, sqlQuery, MAX_ROW_COUNT);

    if (error) {
        return err(new Error(`Distinct values query failed: ${error.message}`));
    }

    // Transform DataFrame to DistinctResult.
    const values = dataFrame.rows.map(row => ({
        value: row[0],
        count: parseInt(String(row[1]), 10),
    }));

    return ok({ column, values });
}
