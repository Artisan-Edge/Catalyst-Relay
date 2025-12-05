// SQL Query Builder — construct safe SQL queries for ADT data preview

import type { Filter, OrderBy } from '../../types/requests';

// Quote SQL identifier to prevent injection
export function quoteIdentifier(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
}

export function buildWhereClauses(filters: Filter[] | undefined): string {
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

export function buildOrderByClauses(orderBy: OrderBy[] | undefined): string {
    if (!orderBy || orderBy.length === 0) {
        return '';
    }

    const clauses = orderBy.map(o => `${o.column} ${o.direction.toUpperCase()}`);
    return ` ORDER BY ${clauses.join(', ')}`;
}

export function formatValue(value: unknown): string {
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
