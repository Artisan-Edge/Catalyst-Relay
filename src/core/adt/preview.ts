// ADT Data Preview — query table/view data, distinct values, row counts

import { DOMParser } from '@xmldom/xmldom';
import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { PreviewQuery } from '../../types/requests';
import type { DataFrame, DistinctResult, ColumnInfo } from '../../types/responses';
import { getConfigByExtension } from './types';
import { extractError } from '../utils/xml';
import { validateSqlInput } from '../utils/sql';
import type { AdtRequestor } from './types';
import { quoteIdentifier, buildWhereClauses, buildOrderByClauses } from './queryBuilder';

const MAX_ROW_COUNT = 50000;

// ===== Data Preview =====

export async function previewData(
    client: AdtRequestor,
    query: PreviewQuery
): AsyncResult<DataFrame, Error> {
    const extension = query.objectType === 'table' ? 'astabldt' : 'asddls';
    const config = getConfigByExtension(extension);

    if (!config || !config.dpEndpoint || !config.dpParam) {
        return err(new Error(`Data preview not supported for object type: ${query.objectType}`));
    }

    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;

    const whereClauses = buildWhereClauses(query.filters);
    const orderByClauses = buildOrderByClauses(query.orderBy);
    const sqlQuery = `select * from ${quoteIdentifier(query.objectName)}${whereClauses}${orderByClauses}`;

    const [valid, validationErr] = validateSqlInput(sqlQuery);
    if (validationErr) {
        return err(new Error(`SQL validation failed: ${validationErr.message}`));
    }

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

    if (requestErr) {
        return err(requestErr);
    }

    if (!response.ok) {
        const text = await response.text();
        const errorMsg = extractError(text);
        return err(new Error(`Data preview failed: ${errorMsg}`));
    }

    const text = await response.text();
    const [dataFrame, parseErr] = parseDataPreview(text, limit, query.objectType === 'table');
    if (parseErr) {
        return err(parseErr);
    }

    return ok(dataFrame);
}

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

    const [valid, validationErr] = validateSqlInput(sqlQuery);
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

    const [valid, validationErr] = validateSqlInput(sqlQuery);
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

// ===== XML Parsing =====

function parseDataPreview(
    xml: string,
    maxRows: number,
    isTable: boolean
): [DataFrame, null] | [null, Error] {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');

        const namespace = 'http://www.sap.com/adt/dataPreview';

        const metadataElements = doc.getElementsByTagNameNS(namespace, 'metadata');
        const columns: ColumnInfo[] = [];

        for (let i = 0; i < metadataElements.length; i++) {
            const meta = metadataElements[i];
            if (!meta) continue;

            const nameAttr = isTable ? 'name' : 'camelCaseName';
            const name = meta.getAttributeNS(namespace, nameAttr) || meta.getAttribute('name');
            const dataType = meta.getAttributeNS(namespace, 'colType') || meta.getAttribute('colType');

            if (name && dataType) {
                columns.push({
                    name,
                    dataType,
                });
            }
        }

        if (columns.length === 0) {
            return err(new Error('No columns found in preview response'));
        }

        const rows: unknown[][] = [];
        const dataSetElements = doc.getElementsByTagNameNS(namespace, 'dataSet');

        const columnData: string[][] = Array.from({ length: columns.length }, () => []);

        for (let i = 0; i < dataSetElements.length; i++) {
            const dataSet = dataSetElements[i];
            if (!dataSet) continue;

            const dataElements = dataSet.getElementsByTagNameNS(namespace, 'data');

            for (let j = 0; j < dataElements.length; j++) {
                const data = dataElements[j];
                if (!data) continue;

                const value = data.textContent?.trim() || '';
                columnData[i]!.push(value);
            }
        }

        const rowCount = columnData[0]?.length || 0;
        for (let i = 0; i < Math.min(rowCount, maxRows); i++) {
            const row: unknown[] = [];
            for (let j = 0; j < columns.length; j++) {
                row.push(columnData[j]![i]);
            }
            rows.push(row);
        }

        const dataFrame: DataFrame = {
            columns,
            rows,
            totalRows: rowCount,
        };

        return [dataFrame, null];
    } catch (error) {
        if (error instanceof Error) {
            return [null, error];
        }
        return [null, new Error('Failed to parse data preview response')];
    }
}
