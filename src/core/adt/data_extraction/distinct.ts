/**
 * Distinct Values — Get distinct column values with counts
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { previewData } from './dataPreview';

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
 * Get distinct values for a column with counts
 *
 * @param client - ADT client
 * @param objectName - Table or view name
 * @param column - Column name
 * @param objectType - 'table' or 'view'
 * @returns Distinct values with counts or error
 */
export async function getDistinctValues(
    client: AdtRequestor,
    objectName: string,
    column: string,
    objectType: 'table' | 'view' = 'view'
): AsyncResult<DistinctResult, Error> {
    const columnName = column.toUpperCase();
    const sqlQuery = `SELECT ${columnName} AS value, COUNT(*) AS count FROM ${objectName} GROUP BY ${columnName}`;

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
