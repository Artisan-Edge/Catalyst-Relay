/**
 * Count Rows — Get total row count for table/view
 */

import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { AdtRequestor } from './types';
import { getConfigByExtension } from './types';
import { extractError } from '../utils/xml';
import { validateSqlInput } from '../utils/sql';
import { quoteIdentifier } from './queryBuilder';
import { parseDataPreview } from './previewParser';

/**
 * Count total rows in a table or view
 *
 * @param client - ADT client
 * @param objectName - Table or view name
 * @param objectType - 'table' or 'view'
 * @returns Row count or error
 */
export async function countRows(
    client: AdtRequestor,
    objectName: string,
    objectType: 'table' | 'view'
): AsyncResult<number, Error> {
    const extension = objectType === 'table' ? 'astabldt' : 'asddls';
    const config = getConfigByExtension(extension);

    if (!config || !config.dpEndpoint || !config.dpParam) {
        return err(new Error(`Data preview not supported for object type: ${objectType}`));
    }

    const sqlQuery = `SELECT COUNT(*) AS count FROM ${quoteIdentifier(objectName)}`;

    const [, validationErr] = validateSqlInput(sqlQuery);
    if (validationErr) {
        return err(new Error(`SQL validation failed: ${validationErr.message}`));
    }

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: `/sap/bc/adt/datapreview/${config.dpEndpoint}`,
        params: {
            'rowNumber': 1,
            [config.dpParam]: objectName,
        },
        headers: {
            'Accept': 'application/vnd.sap.adt.datapreview.table.v1+xml',
        },
        body: sqlQuery,
    });

    if (requestErr) {
        return err(requestErr);
    }

    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Row count query failed: ${errorMsg}`));
    }

    const text = await response.text();
    const [dataFrame, parseErr] = parseDataPreview(text, 1, objectType === 'table');
    if (parseErr) {
        return err(parseErr);
    }

    if (dataFrame.rows.length === 0 || !dataFrame.rows[0] || dataFrame.rows[0].length === 0) {
        return err(new Error('No count value returned'));
    }

    const count = parseInt(String(dataFrame.rows[0]![0]), 10);
    if (isNaN(count)) {
        return err(new Error('Invalid count value returned'));
    }

    return ok(count);
}
