/**
 * Freestyle SQL Query — Execute arbitrary OpenSQL via the freestyle endpoint
 *
 * The freestyle endpoint supports full OpenSQL including COUNT(*), GROUP BY, JOINs, etc.
 * Use this for aggregate queries; use dataPreview.ts for simple table/view previews.
 */

import type { AsyncResult } from '../../../types/result';
import { ok, err } from '../../../types/result';
import type { AdtRequestor } from '../types';
import type { DataFrame } from './previewParser';
import { extractError } from '../../utils/xml';
import { debug } from '../../utils/logging';
import { parseDataPreview } from './previewParser';

const DEFAULT_ROW_LIMIT = 100;

/**
 * Execute arbitrary OpenSQL query via the freestyle endpoint
 *
 * @param client - ADT client
 * @param sqlQuery - OpenSQL SELECT statement
 * @param limit - Max rows to return (default 100)
 * @returns DataFrame or error
 */
export async function freestyleQuery(
    client: AdtRequestor,
    sqlQuery: string,
    limit = DEFAULT_ROW_LIMIT
): AsyncResult<DataFrame, Error> {
    debug(`Freestyle query: ${sqlQuery}`);

    const [response, requestErr] = await client.request({
        method: 'POST',
        path: '/sap/bc/adt/datapreview/freestyle',
        params: {
            'rowNumber': limit,
        },
        headers: {
            'Accept': 'application/xml, application/vnd.sap.adt.datapreview.table.v1+xml',
            'Content-Type': 'text/plain',
        },
        body: sqlQuery,
    });

    if (requestErr) return err(requestErr);

    if (!response.ok) {
        const text = await response.text();
        debug(`Freestyle query error response: ${text.substring(0, 500)}`);
        const errorMsg = extractError(text);
        return err(new Error(`Freestyle query failed: ${errorMsg}`));
    }

    const text = await response.text();
    const [dataFrame, parseErr] = parseDataPreview(text, limit, true);
    if (parseErr) return err(parseErr);

    return ok(dataFrame);
}
