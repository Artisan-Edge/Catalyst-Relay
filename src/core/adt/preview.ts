/**
 * ADT Data Preview Operations
 *
 * Query table and CDS view data, get distinct values, count rows.
 */

import { DOMParser } from '@xmldom/xmldom';
import type { AsyncResult } from '../../types/result';
import { ok, err } from '../../types/result';
import type { PreviewQuery, Filter, OrderBy } from '../../types/requests';
import type { DataFrame, DistinctResult, ColumnInfo } from '../../types/responses';
import { getConfigByExtension } from './types';
import { extractError } from '../utils/xml';
import { validateSqlInput } from '../utils/sql';
import type { AdtRequestor } from './craud';

/**
 * Maximum row count for preview queries
 */
const MAX_ROW_COUNT = 50000;

/**
 * Preview data from a table or CDS view
 *
 * @param client - ADT client
 * @param query - Preview query parameters
 * @returns DataFrame with results or error
 */
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
    const sqlQuery = `select * from ${query.objectName}${whereClauses}${orderByClauses}`;

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

/**
 * Get distinct values for a column
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

    const sqlQuery = `SELECT ${column.toUpperCase()} AS value, COUNT(*) AS count FROM ${objectName} GROUP BY ${column.toUpperCase()}`;

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

    const valueCol = objectType === 'table' ? 'value' : 'value';
    const countCol = objectType === 'table' ? 'count' : 'count';

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

    const sqlQuery = `SELECT COUNT(*) AS count FROM ${objectName}`;

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

/**
 * Build WHERE clause from filters
 */
function buildWhereClauses(filters: Filter[] | undefined): string {
    if (!filters || filters.length === 0) {
        return '';
    }

    const clauses = filters.map(filter => {
        const { column, operator, value } = filter;

        switch (operator) {
            case 'eq':
                return `${column} = ${formatValue(value)}`;
            case 'ne':
                return `${column} != ${formatValue(value)}`;
            case 'gt':
                return `${column} > ${formatValue(value)}`;
            case 'ge':
                return `${column} >= ${formatValue(value)}`;
            case 'lt':
                return `${column} < ${formatValue(value)}`;
            case 'le':
                return `${column} <= ${formatValue(value)}`;
            case 'like':
                return `${column} LIKE ${formatValue(value)}`;
            case 'in':
                if (Array.isArray(value)) {
                    const values = value.map(v => formatValue(v)).join(', ');
                    return `${column} IN (${values})`;
                }
                return `${column} IN (${formatValue(value)})`;
            default:
                return '';
        }
    }).filter(c => c);

    if (clauses.length === 0) {
        return '';
    }

    return ` WHERE ${clauses.join(' AND ')}`;
}

/**
 * Build ORDER BY clause
 */
function buildOrderByClauses(orderBy: OrderBy[] | undefined): string {
    if (!orderBy || orderBy.length === 0) {
        return '';
    }

    const clauses = orderBy.map(o => `${o.column} ${o.direction.toUpperCase()}`);
    return ` ORDER BY ${clauses.join(', ')}`;
}

/**
 * Format value for SQL
 */
function formatValue(value: unknown): string {
    if (value === null) {
        return 'NULL';
    }
    if (typeof value === 'string') {
        return `'${value.replace(/'/g, "''")}'`;
    }
    if (typeof value === 'boolean') {
        return value ? '1' : '0';
    }
    return String(value);
}

/**
 * Parse data preview XML response
 */
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
