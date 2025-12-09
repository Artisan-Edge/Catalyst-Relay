/**
 * Distinct Values — Get distinct column values with counts
 */

import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { AdtRequestor } from './types';

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

import { getConfigByExtension } from './types';
import { extractError, safeParseXml } from '../utils/xml';
import { validateSqlInput } from '../utils/sql';

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
    // Determine endpoint configuration based on object type.
    const extension = objectType === 'table' ? 'astabldt' : 'asddls';
    const config = getConfigByExtension(extension);

    // Validate object type supports data preview operations.
    if (!config || !config.dpEndpoint || !config.dpParam) {
        return err(new Error(`Data preview not supported for object type: ${objectType}`));
    }

    // Construct SQL query for distinct values with counts.
    // SAP ADT data preview uses ABAP Open SQL which does not support quoted identifiers.
    const columnName = column.toUpperCase();
    const sqlQuery = `SELECT ${columnName} AS value, COUNT(*) AS count FROM ${objectName} GROUP BY ${columnName}`;

    // Validate SQL query for injection risks.
    const [, validationErr] = validateSqlInput(sqlQuery);
    if (validationErr) {
        return err(new Error(`SQL validation failed: ${validationErr.message}`));
    }

    // Execute distinct values request.
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

    // Validate successful response.
    if (requestErr) {
        return err(requestErr);
    }

    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Distinct values query failed: ${errorMsg}`));
    }

    // Parse XML response to extract distinct values directly.
    // GROUP BY queries return simpler structure without full column metadata.
    const text = await response.text();
    const [doc, parseErr] = safeParseXml(text);
    if (parseErr) {
        return err(parseErr);
    }

    // Extract data from dataPreview:dataSet elements.
    // XML structure is column-oriented: each dataSet is a column, each data element is a row value.
    // dataSet[0] = "value" column, dataSet[1] = "count" column
    const dataSets = doc.getElementsByTagNameNS('http://www.sap.com/adt/dataPreview', 'dataSet');
    const values: Array<{ value: unknown; count: number }> = [];

    if (dataSets.length < 2) {
        return ok({ column, values: [] });
    }

    const valueDataSet = dataSets[0];
    const countDataSet = dataSets[1];
    if (!valueDataSet || !countDataSet) {
        return ok({ column, values: [] });
    }

    const valueElements = valueDataSet.getElementsByTagNameNS('http://www.sap.com/adt/dataPreview', 'data');
    const countElements = countDataSet.getElementsByTagNameNS('http://www.sap.com/adt/dataPreview', 'data');

    const rowCount = Math.min(valueElements.length, countElements.length);
    for (let i = 0; i < rowCount; i++) {
        const value = valueElements[i]?.textContent ?? '';
        const countText = countElements[i]?.textContent?.trim() ?? '0';
        values.push({
            value,
            count: parseInt(countText, 10),
        });
    }

    const result: DistinctResult = {
        column,
        values,
    };

    return ok(result);
}
