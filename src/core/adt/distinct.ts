/**
 * Distinct Values — Get distinct column values with counts
 */

import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { DistinctResult } from '../../types/responses';
import type { AdtRequestor } from './types';
import { getConfigByExtension } from './types';
import { extractError } from '../utils/xml';
import { validateSqlInput } from '../utils/sql';
import { quoteIdentifier } from './queryBuilder';
import { parseDataPreview } from './previewParser';

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
    const extension = objectType === 'table' ? 'astabldt' : 'asddls';
    const config = getConfigByExtension(extension);

    if (!config || !config.dpEndpoint || !config.dpParam) {
        return err(new Error(`Data preview not supported for object type: ${objectType}`));
    }

    const quotedColumn = quoteIdentifier(column.toUpperCase());
    const quotedTable = quoteIdentifier(objectName);
    const sqlQuery = `SELECT ${quotedColumn} AS value, COUNT(*) AS count FROM ${quotedTable} GROUP BY ${quotedColumn}`;

    const [, validationErr] = validateSqlInput(sqlQuery);
    if (validationErr) {
        return err(new Error(`SQL validation failed: ${validationErr.message}`));
    }

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: `/sap/bc/adt/datapreview/${config.dpEndpoint}`,
        params: {
            'rowNumber': MAX_ROW_COUNT,
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
        return err(new Error(`Distinct values query failed: ${errorMsg}`));
    }

    const text = await response.text();
    const [dataFrame, parseErr] = parseDataPreview(text, MAX_ROW_COUNT, objectType === 'table');
    if (parseErr) {
        return err(parseErr);
    }

    if (dataFrame.columns.length !== 2) {
        return err(new Error('Unexpected data structure from distinct values query'));
    }

    const values = dataFrame.rows.map(row => ({
        value: row[0],
        count: parseInt(String(row[1]), 10),
    }));

    const result: DistinctResult = {
        column,
        values,
    };

    return ok(result);
}
