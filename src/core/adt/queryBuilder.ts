// SQL Query Builder — construct safe SQL queries for ADT data preview

import type { Filter, OrderBy } from '../../types/requests';

// Quote SQL identifier to prevent injection
export function quoteIdentifier(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
}

export function buildWhereClauses(filters: Filter[] | undefined): string {
    // Handle empty or undefined filters.
    if (!filters || filters.length === 0) {
        return '';
    }

    // Build individual filter conditions.
    const clauses = filters.map(filter => {
        const { column, operator, value } = filter;

        // Map operator to SQL syntax.
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
                // Handle array values for IN operator.
                if (Array.isArray(value)) {
                    const values = value.map(v => formatValue(v)).join(', ');
                    return `${column} IN (${values})`;
                }
                return `${column} IN (${formatValue(value)})`;
            default:
                return '';
        }
    }).filter(c => c);

    // Return empty string if no valid clauses.
    if (clauses.length === 0) {
        return '';
    }

    // Join clauses with AND.
    return ` WHERE ${clauses.join(' AND ')}`;
}

export function buildOrderByClauses(orderBy: OrderBy[] | undefined): string {
    // Handle empty or undefined order by.
    if (!orderBy || orderBy.length === 0) {
        return '';
    }

    // Build order by clauses with direction.
    const clauses = orderBy.map(o => `${o.column} ${o.direction.toUpperCase()}`);
    return ` ORDER BY ${clauses.join(', ')}`;
}

export function formatValue(value: unknown): string {
    // Handle null values.
    if (value === null) {
        return 'NULL';
    }

    // Escape and quote strings.
    if (typeof value === 'string') {
        return `'${value.replace(/'/g, "''")}'`;
    }

    // Convert booleans to 1 or 0.
    if (typeof value === 'boolean') {
        return value ? '1' : '0';
    }

    // Convert other types to string.
    return String(value);
}
