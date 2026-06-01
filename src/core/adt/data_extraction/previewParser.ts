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

    const SAP_TYPE_MAP: Record<string, string> = {
        '8': 'integer',   // Int8
        'I': 'integer',   // Integer
        'P': 'decimal',   // Packed decimal
        'F': 'float',     // Floating point
        'D': 'date',      // Date (YYYYMMDD)
        'T': 'time',      // Time (HHMMSS)
        'S': 'timestamp', // Timestamp
        'C': 'string',    // Character
        'N': 'string',    // Numeric character string
        'V': 'string',    // Variable-length character
        'X': 'binary',    // Raw binary/hex
    };

    for (let i = 0; i < metadataElements.length; i++) {
        const meta = metadataElements[i];
        // console.log("meta data index", i);
        if (!meta) continue;

        // Tables use 'name', views use 'camelCaseName'.
        const nameAttr = isTable ? 'name' : 'camelCaseName';
        const name = meta.getAttributeNS(namespace, nameAttr) || meta.getAttribute('name');


        const colType = meta.getAttributeNS(namespace, 'colType') || meta.getAttribute('colType');
        const rawType = meta.getAttributeNS(namespace, 'type') || meta.getAttribute('type');
        const isKeyFigure = meta.getAttributeNS(namespace, 'isKeyFigure') === 'true';

        let dataType: string;

        if (colType && colType.trim() !== '') {
            // Highest priority: Explicit Dictionary Type (CHAR, DATS, etc.)
            dataType = colType;
        } else if (isKeyFigure) {
            // If it's a Key Figure (Amount/Quantity), it's always numeric
            dataType = 'decimal';
        } else if (rawType && SAP_TYPE_MAP[rawType]) {
            // Fallback to mapping the raw 'I' or '8' codes
            dataType = SAP_TYPE_MAP[rawType];
        } else {
            // Absolute fallback
            dataType = 'string';
        }

        const allAttrs: Record<string, string> = {};
        // The attributes property is a NamedNodeMap
        for (let j = 0; j < meta.attributes.length; j++) {
            const attr = meta.attributes[j];
            if (!attr) {
                continue;
            }
            allAttrs[attr.name] = attr.value;
        }
        if (!name || !dataType) continue;
           
        columns.push({ name, dataType });
    }


    // Extract data values organized by column.
    const dataSetElements = doc.getElementsByTagNameNS(namespace, 'dataSet');

    for (let i = 0; i < dataSetElements.length; i++) {
        const dataSet = dataSetElements[i];
        if (!dataSet) continue;
    }

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
