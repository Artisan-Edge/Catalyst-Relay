/**
 * Data Preview — Execute SQL queries against table/view data
 */

import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { PreviewSQL } from '../../types/requests';
import type { AdtRequestor } from './types';
import type { DataFrame } from './previewParser';
import { getConfigByExtension } from './types';
import { extractError } from '../utils/xml';
import { debug } from '../utils/logging';
import { parseDataPreview } from './previewParser';

/**
 * Execute SQL query against table/view data
 *
 * @param client - ADT client
 * @param query - Preview query with SQL
 * @returns DataFrame or error
 */
export async function previewData(
    client: AdtRequestor,
    query: PreviewSQL
): AsyncResult<DataFrame, Error> {
    // Get config by objectType.
    const extension = query.objectType === 'table' ? 'astabldt' : 'asddls';
    const config = getConfigByExtension(extension);
    if (!config?.dpEndpoint || !config?.dpParam) {
        return err(new Error(`Data preview not supported for object type: ${query.objectType}`));
    }

    // Execute request with caller-provided SQL.
    const limit = query.limit ?? 100;
    debug(`Data preview: endpoint=${config.dpEndpoint}, param=${config.dpParam}=${query.objectName}`);
    debug(`SQL: ${query.sqlQuery}`);

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: `/sap/bc/adt/datapreview/${config.dpEndpoint}`,
        params: {
            'rowNumber': limit,
            [config.dpParam]: query.objectName,
        },
        headers: {
            'Accept': 'application/vnd.sap.adt.datapreview.table.v1+xml',
            'Content-Type': 'text/plain',
        },
        body: query.sqlQuery,
    });

    // Handle errors.
    if (requestErr) { return err(requestErr); }
    if (!response.ok) {
        const text = await response.text();
        debug(`Data preview error response: ${text.substring(0, 500)}`);
        const errorMsg = extractError(text);
        return err(new Error(`Data preview failed: ${errorMsg}`));
    }

    // Parse response.
    const text = await response.text();
    const [dataFrame, parseErr] = parseDataPreview(text, limit, query.objectType === 'table');
    if (parseErr) { return err(parseErr); }
    return ok(dataFrame);
}
