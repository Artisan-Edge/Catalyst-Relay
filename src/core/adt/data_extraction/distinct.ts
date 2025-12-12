/**
 * Distinct Values — Get distinct column values with counts
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { previewData } from './dataPreview';
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
 * @param client - ADT client
 * @param objectName - Table or view name
 * @param parameters - CDS view parameters (empty array for tables)
 * @param column - Column name
 * @param objectType - 'table' or 'view'
 * @returns Distinct values with counts or error
 */
export async function getDistinctValues(
    client: AdtRequestor,
    objectName: string,
    parameters: Parameter[],
    column: string,
    objectType: 'table' | 'view' = 'view'
): AsyncResult<DistinctResult, Error> {
    const columnName = column.toUpperCase();
    const sqlQuery = `SELECT ${columnName} AS value, COUNT(*) AS ValueCount FROM ${objectName}${parametersToSQLParams(parameters)} GROUP BY ${columnName} ORDER BY ValueCount DESCENDING`;

    const [dataFrame, error] = await previewData(client, {
        objectName,
        objectType,
        sqlQuery,
        limit: MAX_ROW_COUNT,
    });

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
