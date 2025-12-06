/**
 * Count Rows — Get total row count for table/view
 */

import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { AdtRequestor } from './types';
import { getConfigByExtension } from './types';
import { extractError, safeParseXml } from '../utils/xml';
import { validateSqlInput } from '../utils/sql';

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
    // Determine endpoint configuration based on object type.
    const extension = objectType === 'table' ? 'astabldt' : 'asddls';
    const config = getConfigByExtension(extension);

    // Validate object type supports data preview.
    if (!config || !config.dpEndpoint || !config.dpParam) {
        return err(new Error(`Data preview not supported for object type: ${objectType}`));
    }

    // Build SQL query to count rows.
    // SAP ADT data preview uses ABAP Open SQL which does not support quoted identifiers.
    const sqlQuery = `SELECT COUNT(*) AS count FROM ${objectName}`;

    // Validate SQL query for safety.
    const [, validationErr] = validateSqlInput(sqlQuery);
    if (validationErr) {
        return err(new Error(`SQL validation failed: ${validationErr.message}`));
    }

    // Execute count query request.
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

    // Validate successful request.
    if (requestErr) {
        return err(requestErr);
    }

    // Validate successful response.
    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Row count query failed: ${errorMsg}`));
    }

    // Parse XML response to extract count value directly.
    // COUNT responses have simpler structure without column metadata.
    const text = await response.text();
    const [doc, parseErr] = safeParseXml(text);
    if (parseErr) {
        return err(parseErr);
    }

    // Extract count from dataPreview:data elements.
    const dataElements = doc.getElementsByTagNameNS('http://www.sap.com/adt/dataPreview', 'data');
    if (dataElements.length === 0) {
        return err(new Error('No count value returned'));
    }

    // Get the first data element's text content (the count value).
    const countText = dataElements[0]?.textContent?.trim();
    if (!countText) {
        return err(new Error('Empty count value returned'));
    }

    // Parse and validate count as integer.
    const count = parseInt(countText, 10);
    if (isNaN(count)) {
        return err(new Error('Invalid count value returned'));
    }

    return ok(count);
}
