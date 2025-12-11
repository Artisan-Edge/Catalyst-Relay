/**
 * Preview Parser — Parse data preview XML responses
 *
 * Internal helper used by data.ts, distinct.ts, and count.ts
 */

import type { Result } from '../../../types/result';
import { ok, err } from '../../../types/result';
import { safeParseXml } from '../../utils/xml';

/**
 * Data preview result (columnar format)
 */
export interface DataFrame {
    columns: ColumnInfo[];
    rows: unknown[][];
    totalRows?: number;
}

export interface ColumnInfo {
    name: string;
    dataType: string;
    label?: string;
}

/**
 * Parse data preview XML response
 *
 * Handles two XML formats:
 * 1. Regular queries: Have <metadata> elements with column definitions
 * 2. Aggregate queries (COUNT, GROUP BY): No metadata, infer columns from <dataSet> elements
 *
 * @param xml - XML response from SAP
 * @param maxRows - Maximum rows to parse
 * @param isTable - Whether source is a table (affects column name attribute)
 * @returns DataFrame or error
 */
export function parseDataPreview(
    xml: string,
    maxRows: number,
    isTable: boolean
): Result<DataFrame, Error> {
    // Parse XML response.
    const [doc, parseErr] = safeParseXml(xml);
    if (parseErr) { return err(parseErr); }

    const namespace = 'http://www.sap.com/adt/dataPreview';

    // Extract column metadata from response (if present).
    const metadataElements = doc.getElementsByTagNameNS(namespace, 'metadata');
    const columns: ColumnInfo[] = [];

    for (let i = 0; i < metadataElements.length; i++) {
        const meta = metadataElements[i];
        if (!meta) continue;

        // Tables use 'name', views use 'camelCaseName'.
        const nameAttr = isTable ? 'name' : 'camelCaseName';
        const name = meta.getAttributeNS(namespace, nameAttr) || meta.getAttribute('name');
        const dataType = meta.getAttributeNS(namespace, 'colType') || meta.getAttribute('colType');
        if (!name || !dataType) continue;

        columns.push({ name, dataType });
    }

    // Extract data values organized by column.
    const dataSetElements = doc.getElementsByTagNameNS(namespace, 'dataSet');

    // If no metadata, infer columns from dataSet elements (aggregate queries).
    if (columns.length === 0 && dataSetElements.length > 0) {
        for (let i = 0; i < dataSetElements.length; i++) {
            const dataSet = dataSetElements[i];
            if (!dataSet) continue;
            // Use column index as name for aggregate results.
            const name = dataSet.getAttributeNS(namespace, 'columnName')
                || dataSet.getAttribute('columnName')
                || `column${i}`;
            columns.push({ name, dataType: 'unknown' });
        }
    }

    // Still no columns - return empty DataFrame.
    if (columns.length === 0) {
        return ok({ columns: [], rows: [], totalRows: 0 });
    }

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

    // Transform column-oriented data into row-oriented format.
    const rows: unknown[][] = [];
    const rowCount = columnData[0]?.length || 0;
    for (let i = 0; i < Math.min(rowCount, maxRows); i++) {
        const row: unknown[] = [];
        for (let j = 0; j < columns.length; j++) {
            row.push(columnData[j]![i]);
        }
        rows.push(row);
    }

    // Build final DataFrame result.
    const dataFrame: DataFrame = {
        columns,
        rows,
        totalRows: rowCount,
    };

    return ok(dataFrame);
}
