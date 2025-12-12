/**
 * Query Builder — Optional helper for building SQL queries for data preview
 */

import { type Result, ok, err } from '../../../types/result';
import type { PreviewSQL } from '../../../types/requests';

export function quoteString(value: string | number): string {
    return typeof value == "string" ? "'" + value + "'" : "" + value;
}

// Where Clause Types and Converters
export type BasicFilter = {
    type: "basic";
    field: string;
    value: string | number;
    operator: "=" | "<>" | "<" | "<=" | ">" | ">=" | "like" | "not like";
}

export function basicFilterToWhere(filter: BasicFilter): string {
    return `${filter.field} ${filter.operator} ${quoteString(filter.value)}`;
}

export type BetweenFilter = {
    type: "between";
    field: string;
    minimum: string | number;
    maximum: string | number;
}

export function betweenFilterToWhere(filter: BetweenFilter): string {
    return `${filter.field} between ${quoteString(filter.minimum)} and ${quoteString(filter.maximum)}`;
}

export type ListFilter = {
    type: "list";
    field: string;
    values: (string | number)[];
    include: boolean;
}

export function listFilterToWhere(filter: ListFilter): string {
    return `${filter.field} ${filter.include ? "" : "not "}in ( ${filter.values.map(quoteString).join(", ")} )`;
}

export type QueryFilter = BasicFilter | BetweenFilter | ListFilter;

function queryFilterToWhere(filter: QueryFilter): string {
    if (filter.type === "list") return listFilterToWhere(filter);
    if (filter.type === "between") return betweenFilterToWhere(filter);
    return basicFilterToWhere(filter);
}

export function queryFiltersToWhere(filters: QueryFilter[]): string {
    if (filters.length === 0) return "";
    return `\nwhere ${filters.map(queryFilterToWhere).join(" and ")}`;
}

// Order By Types and Converters
export type Sorting = {
    field: string;
    direction: "ascending" | "descending";
}

export function sortingsToOrderBy(sortings: Sorting[]): string {
    if (sortings.length === 0) return "";
    return `\norder by ${sortings.map(s => `${s.field} ${s.direction}`).join(", ")}`;
}

// Aggregation Types
export type Aggregation = {
    field: string;
    function: "count" | "sum" | "avg" | "min" | "max";
}

export function fieldsToGroupbyClause(fields: string[]): string {
    if (fields.length === 0) return "";
    return `\ngroup by ${fields.join(", ")}`;
}

export function aggregationToFieldDefinition(aggregation: Aggregation): string {
    if (aggregation.function === "count") {
        return `count( distinct main~${aggregation.field} ) as ${aggregation.field}`;
    }
    return `${aggregation.function}( main~${aggregation.field} ) as ${aggregation.field}`;
}

// Parameter Types
export type Parameter = {
    name: string;
    value: string | number;
}

export function parametersToSQLParams(params: Parameter[]): string {
    if (params.length === 0) return "";
    return `( ${params.map(p => `${p.name} = ${quoteString(p.value)}`).join(", ")})`;
}

// Query Type
export type DataPreviewQuery = {
    objectName: string;
    objectType: 'table' | 'view';
    limit?: number;

    fields: string[];
    parameters?: Parameter[];
    filters?: QueryFilter[];
    sortings?: Sorting[];
    aggregations?: Aggregation[];
}

export function buildSQLQuery(query: DataPreviewQuery): Result<PreviewSQL> {
    // Isolate filters, sortings, and aggregations with defaults.
    const [parameters, filters, sortings, aggregations] = [query.parameters ?? [], query.filters ?? [], query.sortings ?? [], query.aggregations ?? []];
    const groupingFields = query.fields.filter(f => !aggregations.find(a => a.field === f));

    // Do some validation.
    if (sortings.filter(s => !query.fields.includes(s.field)).length > 0) {
        return err(new Error("Sorting fields must be included in the selected fields."));
    }

    // Build main field selection.
    let selectClause = "select\n";

    const fieldSelections: string[] = [];
    for (const field of query.fields) {
        const aggregation = aggregations.find(a => a.field === field);
        if (aggregation) {
            fieldSelections.push(`\t${aggregationToFieldDefinition(aggregation)}`);
            continue;
        }
        fieldSelections.push(`\tmain~${field}`);
    }
    selectClause += fieldSelections.join(",\n") + `\nfrom ${query.objectName}${parametersToSQLParams(parameters)} as main\n`;

    // Build the rest of the clauses.
    const [whereClause, groupbyClause, orderbyClause] = [queryFiltersToWhere(filters), aggregations.length ? fieldsToGroupbyClause(groupingFields) : "", sortingsToOrderBy(sortings)];

    const result: PreviewSQL = {
        objectName: query.objectName,
        objectType: query.objectType,
        sqlQuery: `${selectClause}${whereClause}${groupbyClause}${orderbyClause}`,
    };
    if (query.limit !== undefined) result.limit = query.limit;
    return ok(result);
}
