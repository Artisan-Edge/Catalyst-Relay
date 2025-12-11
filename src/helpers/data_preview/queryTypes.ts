
const quoteString = (value: string | number): string => {
    return typeof value == "string" ? "'" + value + "'" : "" + value
}

// Where Clause Types and Converters
export type BasicFilter = {
    type: "basic";
    field: string;
    value: string | number;
    operator: "=" | "<>" | "<" | "<=" | ">" | ">=" | "like" | "not like";
}

const basicFilterToWhere = (filter: BasicFilter): string => {
    return `${filter.field} ${filter.operator} ${quoteString(filter.value)}`;
}

export type BetweenFilter = {
    type: "between";
    field: string;
    minimum: string | number;
    maximum: string | number;
}

const betweenFilterToWhere = (filter: BetweenFilter): string => {
    return `${filter.field} between ${quoteString(filter.minimum)} and ${quoteString(filter.maximum)}`;
}

export type ListFilter = {
    type: "list";
    field: string;
    values: (string | number)[];
    include: boolean;
}

const listFilterToWhere = (filter: ListFilter): string => {
    return `${filter.field} ${filter.include ? "" : "not "}in ( ${filter.values.map(quoteString).join(", ")} )`;
}

export type QueryFilter = BasicFilter | BetweenFilter | ListFilter;

const queryFilterToWhere = (filter: QueryFilter): string => {
    if (filter.type === "list") return listFilterToWhere(filter);
    if (filter.type === "between") return betweenFilterToWhere(filter);
    return basicFilterToWhere(filter);
};

export const queryFiltersToWhere = (filters: QueryFilter[]): string => {
    if (filters.length === 0) return "";
    return `where ${filters.map(queryFilterToWhere).join(" and ")}`;
};

// Order By Types and Converters
export type Sorting = {
    field: string;
    direction: "asc" | "desc";
}

export const sortingsToOrderBy = (sortings: Sorting[]): string => {
    if (sortings.length === 0) return "";
    return `order by ${sortings.map(s => `${s.field} ${s.direction}`).join(", ")}`;
}