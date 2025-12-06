/**
 * Data Preview — Query table/view data
 */

import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { PreviewQuery } from '../../types/requests';
import type { DataFrame } from '../../types/responses';
import type { AdtRequestor } from './types';
import { getConfigByExtension } from './types';
import { extractError } from '../utils/xml';
import { validateSqlInput } from '../utils/sql';
import { quoteIdentifier, buildWhereClauses, buildOrderByClauses } from './queryBuilder';
import { parseDataPreview } from './previewParser';

/**
 * Preview table/view data with filters and sorting
 *
 * @param client - ADT client
 * @param query - Preview query parameters
 * @returns DataFrame or error
 */
export async function previewData(
    client: AdtRequestor,
    query: PreviewQuery
): AsyncResult<DataFrame, Error> {
    // Confirm object is valid for data previews.
    const extension = query.objectType === 'table' ? 'astabldt' : 'asddls';
    const config = getConfigByExtension(extension);
    if (!config || !config.dpEndpoint || !config.dpParam) {
        return err(new Error(`Data preview not supported for object type: ${query.objectType}`));
    }

    // Construct SQL query for data preview
    const limit = query.limit ?? 100;

    const whereClauses = buildWhereClauses(query.filters);
    const orderByClauses = buildOrderByClauses(query.orderBy);
    const sqlQuery = `select * from ${quoteIdentifier(query.objectName)}${whereClauses}${orderByClauses}`;

    const [, validationErr] = validateSqlInput(sqlQuery);
    if (validationErr) {
        return err(new Error(`SQL validation failed: ${validationErr.message}`));
    }

    // Execute data preview request.
    const [response, requestErr] = await client.request({
        method: 'POST',
        path: `/sap/bc/adt/datapreview/${config.dpEndpoint}`,
        params: {
            'rowNumber': limit,
            [config.dpParam]: query.objectName,
        },
        headers: {
            'Accept': 'application/vnd.sap.adt.datapreview.table.v1+xml',
        },
        body: sqlQuery,
    });

    // Validate successful response.
    if (requestErr) { return err(requestErr); }
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Data preview failed: ${errorMsg}`));
    }
    const text = await response.text();

    // Confirm successful dataframe format
    const [dataFrame, parseErr] = parseDataPreview(text, limit, query.objectType === 'table');
    if (parseErr) { return err(parseErr); }
    return ok(dataFrame);
}
