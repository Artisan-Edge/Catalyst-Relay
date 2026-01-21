/**
 * Count Rows — Get total row count for table/view
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import { freestyleQuery } from './freestyle';

/**
 * Count total rows in a table or view
 *
 * Uses the freestyle endpoint which supports COUNT(*) aggregation.
 */
export async function countRows(
    client: AdtRequestor,
    objectName: string,
    _objectType: 'table' | 'view'
): AsyncResult<number, Error> {
    const sqlQuery = `SELECT COUNT(*) AS row_count FROM ${objectName}`;

    const [dataFrame, error] = await freestyleQuery(client, sqlQuery, 1);

    if (error) {
        return err(new Error(`Row count query failed: ${error.message}`));
    }

    // Extract count from first row, first column.
    const countValue = dataFrame.rows[0]?.[0];
    if (countValue === undefined) {
        return err(new Error('No count value returned'));
    }

    const count = parseInt(String(countValue), 10);
    if (isNaN(count)) {
        return err(new Error('Invalid count value returned'));
    }

    return ok(count);
}
