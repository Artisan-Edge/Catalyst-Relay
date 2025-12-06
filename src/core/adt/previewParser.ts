/**
 * Preview Parser — Parse data preview XML responses
 *
 * Internal helper used by data.ts, distinct.ts, and count.ts
 */

import { DOMParser } from '@xmldom/xmldom';
import type { DataFrame, ColumnInfo } from '../../types/responses';

/**
 * Parse data preview XML response
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
            return [null, new Error('No columns found in preview response')];
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
