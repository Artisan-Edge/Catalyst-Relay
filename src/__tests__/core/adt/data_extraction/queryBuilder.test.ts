/**
 * Unit Tests for Query Builder
 *
 * Tests SQL query generation for data preview operations:
 * - Basic filter generation (=, <>, like, etc.)
 * - Between filter generation
 * - List filter generation (IN / NOT IN)
 * - WHERE clause combination
 * - ORDER BY clause generation
 * - GROUP BY clause generation
 * - Aggregation field definitions
 * - Full query building with validation
 */

import { describe, it, expect } from 'bun:test';
import {
    queryFiltersToWhere,
    sortingsToOrderBy,
    fieldsToGroupbyClause,
    aggregationToFieldDefinition,
    parametersToSQLParams,
    buildSQLQuery,
    type BasicFilter,
    type BetweenFilter,
    type ListFilter,
    type QueryFilter,
    type Sorting,
    type Aggregation,
    type Parameter,
    type DataPreviewQuery,
} from '../../../../core/adt/data_extraction/queryBuilder';

// =============================================================================
// WHERE Clause Tests
// =============================================================================

describe('queryFiltersToWhere', () => {
    describe('empty filters', () => {
        it('should return empty string for empty filter array', () => {
            const result = queryFiltersToWhere([]);
            expect(result).toBe('');
        });
    });

    describe('basic filters', () => {
        it('should generate = operator with string value', () => {
            const filter: BasicFilter = {
                type: 'basic',
                field: 'MANDT',
                value: '100',
                operator: '=',
            };
            const result = queryFiltersToWhere([filter]);
            expect(result).toBe("\nwhere MANDT = '100'");
        });

        it('should generate = operator with numeric value', () => {
            const filter: BasicFilter = {
                type: 'basic',
                field: 'COUNT',
                value: 42,
                operator: '=',
            };
            const result = queryFiltersToWhere([filter]);
            expect(result).toBe('\nwhere COUNT = 42');
        });

        it('should generate <> operator', () => {
            const filter: BasicFilter = {
                type: 'basic',
                field: 'STATUS',
                value: 'DELETED',
                operator: '<>',
            };
            const result = queryFiltersToWhere([filter]);
            expect(result).toBe("\nwhere STATUS <> 'DELETED'");
        });

        it('should generate < operator', () => {
            const filter: BasicFilter = {
                type: 'basic',
                field: 'AMOUNT',
                value: 1000,
                operator: '<',
            };
            const result = queryFiltersToWhere([filter]);
            expect(result).toBe('\nwhere AMOUNT < 1000');
        });

        it('should generate <= operator', () => {
            const filter: BasicFilter = {
                type: 'basic',
                field: 'AMOUNT',
                value: 1000,
                operator: '<=',
            };
            const result = queryFiltersToWhere([filter]);
            expect(result).toBe('\nwhere AMOUNT <= 1000');
        });

        it('should generate > operator', () => {
            const filter: BasicFilter = {
                type: 'basic',
                field: 'AMOUNT',
                value: 0,
                operator: '>',
            };
            const result = queryFiltersToWhere([filter]);
            expect(result).toBe('\nwhere AMOUNT > 0');
        });

        it('should generate >= operator', () => {
            const filter: BasicFilter = {
                type: 'basic',
                field: 'AMOUNT',
                value: 0,
                operator: '>=',
            };
            const result = queryFiltersToWhere([filter]);
            expect(result).toBe('\nwhere AMOUNT >= 0');
        });

        it('should generate like operator', () => {
            const filter: BasicFilter = {
                type: 'basic',
                field: 'NAME',
                value: '%TEST%',
                operator: 'like',
            };
            const result = queryFiltersToWhere([filter]);
            expect(result).toBe("\nwhere NAME like '%TEST%'");
        });

        it('should generate not like operator', () => {
            const filter: BasicFilter = {
                type: 'basic',
                field: 'NAME',
                value: '%TEMP%',
                operator: 'not like',
            };
            const result = queryFiltersToWhere([filter]);
            expect(result).toBe("\nwhere NAME not like '%TEMP%'");
        });
    });

    describe('between filters', () => {
        it('should generate between with string values', () => {
            const filter: BetweenFilter = {
                type: 'between',
                field: 'DATE',
                minimum: '20240101',
                maximum: '20241231',
            };
            const result = queryFiltersToWhere([filter]);
            expect(result).toBe("\nwhere DATE between '20240101' and '20241231'");
        });

        it('should generate between with numeric values', () => {
            const filter: BetweenFilter = {
                type: 'between',
                field: 'AMOUNT',
                minimum: 100,
                maximum: 500,
            };
            const result = queryFiltersToWhere([filter]);
            expect(result).toBe('\nwhere AMOUNT between 100 and 500');
        });

        it('should generate between with mixed values', () => {
            const filter: BetweenFilter = {
                type: 'between',
                field: 'CODE',
                minimum: 'A',
                maximum: 'Z',
            };
            const result = queryFiltersToWhere([filter]);
            expect(result).toBe("\nwhere CODE between 'A' and 'Z'");
        });
    });

    describe('list filters', () => {
        it('should generate IN with string values', () => {
            const filter: ListFilter = {
                type: 'list',
                field: 'STATUS',
                values: ['ACTIVE', 'PENDING'],
                include: true,
            };
            const result = queryFiltersToWhere([filter]);
            expect(result).toBe("\nwhere STATUS in ( 'ACTIVE', 'PENDING' )");
        });

        it('should generate NOT IN with string values', () => {
            const filter: ListFilter = {
                type: 'list',
                field: 'STATUS',
                values: ['DELETED', 'ARCHIVED'],
                include: false,
            };
            const result = queryFiltersToWhere([filter]);
            expect(result).toBe("\nwhere STATUS not in ( 'DELETED', 'ARCHIVED' )");
        });

        it('should generate IN with numeric values', () => {
            const filter: ListFilter = {
                type: 'list',
                field: 'CLIENT',
                values: [100, 200, 300],
                include: true,
            };
            const result = queryFiltersToWhere([filter]);
            expect(result).toBe('\nwhere CLIENT in ( 100, 200, 300 )');
        });

        it('should generate IN with single value', () => {
            const filter: ListFilter = {
                type: 'list',
                field: 'MANDT',
                values: ['100'],
                include: true,
            };
            const result = queryFiltersToWhere([filter]);
            expect(result).toBe("\nwhere MANDT in ( '100' )");
        });

        it('should generate IN with mixed values', () => {
            const filter: ListFilter = {
                type: 'list',
                field: 'CODES',
                values: ['A', 1, 'B', 2],
                include: true,
            };
            const result = queryFiltersToWhere([filter]);
            expect(result).toBe("\nwhere CODES in ( 'A', 1, 'B', 2 )");
        });
    });

    describe('combined filters', () => {
        it('should combine multiple filters with AND', () => {
            const filters: QueryFilter[] = [
                { type: 'basic', field: 'MANDT', value: '100', operator: '=' },
                { type: 'basic', field: 'STATUS', value: 'ACTIVE', operator: '=' },
            ];
            const result = queryFiltersToWhere(filters);
            expect(result).toBe("\nwhere MANDT = '100' and STATUS = 'ACTIVE'");
        });

        it('should combine different filter types', () => {
            const filters: QueryFilter[] = [
                { type: 'basic', field: 'MANDT', value: '100', operator: '=' },
                { type: 'between', field: 'DATE', minimum: '20240101', maximum: '20241231' },
                { type: 'list', field: 'TYPE', values: ['A', 'B'], include: true },
            ];
            const result = queryFiltersToWhere(filters);
            expect(result).toBe("\nwhere MANDT = '100' and DATE between '20240101' and '20241231' and TYPE in ( 'A', 'B' )");
        });

        it('should handle three filters', () => {
            const filters: QueryFilter[] = [
                { type: 'basic', field: 'A', value: 1, operator: '=' },
                { type: 'basic', field: 'B', value: 2, operator: '>' },
                { type: 'basic', field: 'C', value: 3, operator: '<' },
            ];
            const result = queryFiltersToWhere(filters);
            expect(result).toBe('\nwhere A = 1 and B > 2 and C < 3');
        });
    });
});

// =============================================================================
// ORDER BY Clause Tests
// =============================================================================

describe('sortingsToOrderBy', () => {
    it('should return empty string for empty sortings', () => {
        const result = sortingsToOrderBy([]);
        expect(result).toBe('');
    });

    it('should generate single ascending sort', () => {
        const sortings: Sorting[] = [{ field: 'NAME', direction: 'ascending' }];
        const result = sortingsToOrderBy(sortings);
        expect(result).toBe('\norder by NAME ascending');
    });

    it('should generate single descending sort', () => {
        const sortings: Sorting[] = [{ field: 'DATE', direction: 'descending' }];
        const result = sortingsToOrderBy(sortings);
        expect(result).toBe('\norder by DATE descending');
    });

    it('should generate multiple sortings', () => {
        const sortings: Sorting[] = [
            { field: 'STATUS', direction: 'ascending' },
            { field: 'DATE', direction: 'descending' },
        ];
        const result = sortingsToOrderBy(sortings);
        expect(result).toBe('\norder by STATUS ascending, DATE descending');
    });

    it('should handle three sortings', () => {
        const sortings: Sorting[] = [
            { field: 'A', direction: 'ascending' },
            { field: 'B', direction: 'descending' },
            { field: 'C', direction: 'ascending' },
        ];
        const result = sortingsToOrderBy(sortings);
        expect(result).toBe('\norder by A ascending, B descending, C ascending');
    });
});

// =============================================================================
// GROUP BY Clause Tests
// =============================================================================

describe('fieldsToGroupbyClause', () => {
    it('should return empty string for empty fields', () => {
        const result = fieldsToGroupbyClause([]);
        expect(result).toBe('');
    });

    it('should generate single field group by', () => {
        const result = fieldsToGroupbyClause(['STATUS']);
        expect(result).toBe('\ngroup by STATUS');
    });

    it('should generate multiple fields group by', () => {
        const result = fieldsToGroupbyClause(['STATUS', 'TYPE', 'CATEGORY']);
        expect(result).toBe('\ngroup by STATUS, TYPE, CATEGORY');
    });
});

// =============================================================================
// Parameter Tests
// =============================================================================

describe('parametersToSQLParams', () => {
    it('should return empty string for empty parameters', () => {
        const result = parametersToSQLParams([]);
        expect(result).toBe('');
    });

    it('should generate single string parameter', () => {
        const params: Parameter[] = [{ name: 'P_BUKRS', value: '1000' }];
        const result = parametersToSQLParams(params);
        expect(result).toBe("( P_BUKRS = '1000' )");
    });

    it('should generate single numeric parameter', () => {
        const params: Parameter[] = [{ name: 'P_YEAR', value: 2024 }];
        const result = parametersToSQLParams(params);
        expect(result).toBe('( P_YEAR = 2024 )');
    });

    it('should generate multiple parameters', () => {
        const params: Parameter[] = [
            { name: 'P_BUKRS', value: '1000' },
            { name: 'P_GJAHR', value: 2024 },
        ];
        const result = parametersToSQLParams(params);
        expect(result).toBe("( P_BUKRS = '1000', P_GJAHR = 2024 )");
    });

    it('should handle three parameters', () => {
        const params: Parameter[] = [
            { name: 'P_MANDT', value: '100' },
            { name: 'P_BUKRS', value: '1000' },
            { name: 'P_GJAHR', value: 2024 },
        ];
        const result = parametersToSQLParams(params);
        expect(result).toBe("( P_MANDT = '100', P_BUKRS = '1000', P_GJAHR = 2024 )");
    });
});

// =============================================================================
// Aggregation Tests
// =============================================================================

describe('aggregationToFieldDefinition', () => {
    it('should generate count distinct', () => {
        const agg: Aggregation = { field: 'ID', function: 'count' };
        const result = aggregationToFieldDefinition(agg);
        expect(result).toBe('count( distinct main~ID ) as ID');
    });

    it('should generate sum', () => {
        const agg: Aggregation = { field: 'AMOUNT', function: 'sum' };
        const result = aggregationToFieldDefinition(agg);
        expect(result).toBe('sum( main~AMOUNT ) as AMOUNT');
    });

    it('should generate avg', () => {
        const agg: Aggregation = { field: 'PRICE', function: 'avg' };
        const result = aggregationToFieldDefinition(agg);
        expect(result).toBe('avg( main~PRICE ) as PRICE');
    });

    it('should generate min', () => {
        const agg: Aggregation = { field: 'DATE', function: 'min' };
        const result = aggregationToFieldDefinition(agg);
        expect(result).toBe('min( main~DATE ) as DATE');
    });

    it('should generate max', () => {
        const agg: Aggregation = { field: 'DATE', function: 'max' };
        const result = aggregationToFieldDefinition(agg);
        expect(result).toBe('max( main~DATE ) as DATE');
    });
});

// =============================================================================
// Full Query Building Tests
// =============================================================================

describe('buildSQLQuery', () => {
    describe('basic queries', () => {
        it('should build simple select query for table', () => {
            const query: DataPreviewQuery = {
                objectName: 'T000',
                objectType: 'table',
                fields: ['MANDT', 'CCCATEGORY'],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result).not.toBeNull();
            expect(result?.objectName).toBe('T000');
            expect(result?.objectType).toBe('table');
            expect(result?.sqlQuery).toContain('select');
            expect(result?.sqlQuery).toContain('main~MANDT');
            expect(result?.sqlQuery).toContain('main~CCCATEGORY');
            expect(result?.sqlQuery).toContain('from T000 as main');
        });

        it('should build simple select query for view', () => {
            const query: DataPreviewQuery = {
                objectName: 'I_COSTCENTER',
                objectType: 'view',
                fields: ['CostCenter', 'CompanyCode'],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result).not.toBeNull();
            expect(result?.objectType).toBe('view');
            expect(result?.sqlQuery).toContain('from I_COSTCENTER as main');
        });

        it('should include limit when provided', () => {
            const query: DataPreviewQuery = {
                objectName: 'T000',
                objectType: 'table',
                fields: ['MANDT'],
                limit: 100,
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result?.limit).toBe(100);
        });

        it('should not include limit when not provided', () => {
            const query: DataPreviewQuery = {
                objectName: 'T000',
                objectType: 'table',
                fields: ['MANDT'],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result?.limit).toBeUndefined();
        });
    });

    describe('queries with filters', () => {
        it('should include WHERE clause with basic filter', () => {
            const query: DataPreviewQuery = {
                objectName: 'T000',
                objectType: 'table',
                fields: ['MANDT', 'CCCATEGORY'],
                filters: [
                    { type: 'basic', field: 'MANDT', value: '100', operator: '=' },
                ],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result?.sqlQuery).toContain("where MANDT = '100'");
        });

        it('should include WHERE clause with multiple filters', () => {
            const query: DataPreviewQuery = {
                objectName: 'USR02',
                objectType: 'table',
                fields: ['MANDT', 'BNAME', 'USTYP'],
                filters: [
                    { type: 'basic', field: 'MANDT', value: '100', operator: '=' },
                    { type: 'list', field: 'USTYP', values: ['A', 'B'], include: true },
                ],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result?.sqlQuery).toContain("where MANDT = '100' and USTYP in ( 'A', 'B' )");
        });
    });

    describe('queries with parameters', () => {
        it('should include parameters in FROM clause for CDS view', () => {
            const query: DataPreviewQuery = {
                objectName: 'I_COSTCENTER',
                objectType: 'view',
                fields: ['CostCenter', 'CompanyCode'],
                parameters: [{ name: 'P_LANGUAGE', value: 'EN' }],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result?.sqlQuery).toContain("from I_COSTCENTER( P_LANGUAGE = 'EN' ) as main");
        });

        it('should include multiple parameters', () => {
            const query: DataPreviewQuery = {
                objectName: 'I_GLACCOUNTBALANCE',
                objectType: 'view',
                fields: ['GLAccount', 'AmountInCompanyCodeCurrency'],
                parameters: [
                    { name: 'P_FROMPERIOD', value: '001' },
                    { name: 'P_TOPERIOD', value: '012' },
                ],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result?.sqlQuery).toContain("from I_GLACCOUNTBALANCE( P_FROMPERIOD = '001', P_TOPERIOD = '012' ) as main");
        });

        it('should include numeric parameters', () => {
            const query: DataPreviewQuery = {
                objectName: 'I_FISCALYEARPERIOD',
                objectType: 'view',
                fields: ['FiscalYear', 'FiscalPeriod'],
                parameters: [{ name: 'P_FISCALYEAR', value: 2024 }],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result?.sqlQuery).toContain('from I_FISCALYEARPERIOD( P_FISCALYEAR = 2024 ) as main');
        });

        it('should work without parameters (empty array)', () => {
            const query: DataPreviewQuery = {
                objectName: 'T000',
                objectType: 'table',
                fields: ['MANDT'],
                parameters: [],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result?.sqlQuery).toContain('from T000 as main');
            expect(result?.sqlQuery).not.toContain('( ');
        });

        it('should combine parameters with filters', () => {
            const query: DataPreviewQuery = {
                objectName: 'I_COSTCENTER',
                objectType: 'view',
                fields: ['CostCenter', 'CompanyCode'],
                parameters: [{ name: 'P_LANGUAGE', value: 'EN' }],
                filters: [
                    { type: 'basic', field: 'CompanyCode', value: '1000', operator: '=' },
                ],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result?.sqlQuery).toContain("from I_COSTCENTER( P_LANGUAGE = 'EN' ) as main");
            expect(result?.sqlQuery).toContain("where CompanyCode = '1000'");
        });
    });

    describe('queries with sorting', () => {
        it('should include ORDER BY clause', () => {
            const query: DataPreviewQuery = {
                objectName: 'T000',
                objectType: 'table',
                fields: ['MANDT', 'CCCATEGORY'],
                sortings: [{ field: 'MANDT', direction: 'ascending' }],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result?.sqlQuery).toContain('order by MANDT ascending');
        });

        it('should include multiple sortings', () => {
            const query: DataPreviewQuery = {
                objectName: 'T000',
                objectType: 'table',
                fields: ['MANDT', 'CCCATEGORY', 'CCNOCLIIND'],
                sortings: [
                    { field: 'MANDT', direction: 'ascending' },
                    { field: 'CCCATEGORY', direction: 'descending' },
                ],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result?.sqlQuery).toContain('order by MANDT ascending, CCCATEGORY descending');
        });

        it('should return error when sorting field not in selected fields', () => {
            const query: DataPreviewQuery = {
                objectName: 'T000',
                objectType: 'table',
                fields: ['MANDT'],
                sortings: [{ field: 'CCCATEGORY', direction: 'ascending' }],
            };
            const [result, error] = buildSQLQuery(query);

            expect(result).toBeNull();
            expect(error).toBeInstanceOf(Error);
            expect(error?.message).toContain('Sorting fields must be included');
        });
    });

    describe('queries with aggregations', () => {
        it('should generate count aggregation', () => {
            const query: DataPreviewQuery = {
                objectName: 'T000',
                objectType: 'table',
                fields: ['MANDT'],
                aggregations: [{ field: 'MANDT', function: 'count' }],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result?.sqlQuery).toContain('count( distinct main~MANDT ) as MANDT');
        });

        it('should generate sum aggregation', () => {
            const query: DataPreviewQuery = {
                objectName: 'BSEG',
                objectType: 'table',
                fields: ['DMBTR'],
                aggregations: [{ field: 'DMBTR', function: 'sum' }],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result?.sqlQuery).toContain('sum( main~DMBTR ) as DMBTR');
        });

        it('should mix aggregated and non-aggregated fields with GROUP BY', () => {
            const query: DataPreviewQuery = {
                objectName: 'BKPF',
                objectType: 'table',
                fields: ['BUKRS', 'GJAHR', 'BELNR'],
                aggregations: [{ field: 'BELNR', function: 'count' }],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result?.sqlQuery).toContain('main~BUKRS');
            expect(result?.sqlQuery).toContain('main~GJAHR');
            expect(result?.sqlQuery).toContain('count( distinct main~BELNR ) as BELNR');
            expect(result?.sqlQuery).toContain('group by BUKRS, GJAHR');
        });
    });

    describe('complex queries', () => {
        it('should combine filters, sorting, and aggregation', () => {
            const query: DataPreviewQuery = {
                objectName: 'BSEG',
                objectType: 'table',
                fields: ['BUKRS', 'DMBTR'],
                filters: [
                    { type: 'basic', field: 'MANDT', value: '100', operator: '=' },
                    { type: 'basic', field: 'GJAHR', value: 2024, operator: '=' },
                ],
                sortings: [{ field: 'BUKRS', direction: 'ascending' }],
                aggregations: [{ field: 'DMBTR', function: 'sum' }],
                limit: 1000,
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result).not.toBeNull();
            expect(result?.objectName).toBe('BSEG');
            expect(result?.limit).toBe(1000);

            const sql = result?.sqlQuery ?? '';
            expect(sql).toContain('select');
            expect(sql).toContain('main~BUKRS');
            expect(sql).toContain('sum( main~DMBTR ) as DMBTR');
            expect(sql).toContain('from BSEG as main');
            expect(sql).toContain("where MANDT = '100' and GJAHR = 2024");
            expect(sql).toContain('group by BUKRS');
            expect(sql).toContain('order by BUKRS ascending');
        });

        it('should handle query with all optional parameters empty', () => {
            const query: DataPreviewQuery = {
                objectName: 'T000',
                objectType: 'table',
                fields: ['MANDT', 'CCCATEGORY'],
                filters: [],
                sortings: [],
                aggregations: [],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            const sql = result?.sqlQuery ?? '';
            expect(sql).not.toContain('where');
            expect(sql).not.toContain('order by');
            expect(sql).not.toContain('group by');
        });
    });

    describe('exact SQL output', () => {
        it('should generate exact SQL for simple select', () => {
            const query: DataPreviewQuery = {
                objectName: 'T000',
                objectType: 'table',
                fields: ['MANDT', 'CCCATEGORY'],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result?.sqlQuery).toBe(
`select
\tmain~MANDT,
\tmain~CCCATEGORY
from T000 as main
`
            );
        });

        it('should generate exact SQL with WHERE and ORDER BY', () => {
            const query: DataPreviewQuery = {
                objectName: 'USR02',
                objectType: 'table',
                fields: ['MANDT', 'BNAME', 'USTYP'],
                filters: [
                    { type: 'basic', field: 'MANDT', value: '100', operator: '=' },
                    { type: 'basic', field: 'USTYP', value: 'A', operator: '<>' },
                ],
                sortings: [
                    { field: 'BNAME', direction: 'ascending' },
                ],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result?.sqlQuery).toBe(
`select
\tmain~MANDT,
\tmain~BNAME,
\tmain~USTYP
from USR02 as main

where MANDT = '100' and USTYP <> 'A'
order by BNAME ascending`
            );
        });

        it('should generate exact SQL with aggregation and GROUP BY', () => {
            const query: DataPreviewQuery = {
                objectName: 'BKPF',
                objectType: 'table',
                fields: ['BUKRS', 'GJAHR', 'BELNR'],
                filters: [
                    { type: 'basic', field: 'MANDT', value: '100', operator: '=' },
                ],
                sortings: [
                    { field: 'BUKRS', direction: 'ascending' },
                    { field: 'GJAHR', direction: 'descending' },
                ],
                aggregations: [
                    { field: 'BELNR', function: 'count' },
                ],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result?.sqlQuery).toBe(
`select
\tmain~BUKRS,
\tmain~GJAHR,
\tcount( distinct main~BELNR ) as BELNR
from BKPF as main

where MANDT = '100'
group by BUKRS, GJAHR
order by BUKRS ascending, GJAHR descending`
            );
        });
    });

    describe('exact SQL output with parameters', () => {
        it('should generate exact SQL for parameterized CDS view', () => {
            const query: DataPreviewQuery = {
                objectName: 'I_COSTCENTER',
                objectType: 'view',
                fields: ['CostCenter', 'CompanyCode', 'ValidityEndDate'],
                parameters: [
                    { name: 'P_LANGUAGE', value: 'EN' },
                ],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result?.sqlQuery).toBe(
`select
\tmain~CostCenter,
\tmain~CompanyCode,
\tmain~ValidityEndDate
from I_COSTCENTER( P_LANGUAGE = 'EN' ) as main
`
            );
        });

        it('should generate exact SQL with parameters, filters, and sorting', () => {
            const query: DataPreviewQuery = {
                objectName: 'I_GLACCOUNTBALANCE',
                objectType: 'view',
                fields: ['CompanyCode', 'GLAccount', 'AmountInCompanyCodeCurrency'],
                parameters: [
                    { name: 'P_FROMPERIOD', value: '001' },
                    { name: 'P_TOPERIOD', value: '012' },
                ],
                filters: [
                    { type: 'basic', field: 'CompanyCode', value: '1000', operator: '=' },
                ],
                sortings: [
                    { field: 'GLAccount', direction: 'ascending' },
                ],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result?.sqlQuery).toBe(
`select
\tmain~CompanyCode,
\tmain~GLAccount,
\tmain~AmountInCompanyCodeCurrency
from I_GLACCOUNTBALANCE( P_FROMPERIOD = '001', P_TOPERIOD = '012' ) as main

where CompanyCode = '1000'
order by GLAccount ascending`
            );
        });
    });

    describe('SQL structure validation', () => {
        it('should have correct clause order: SELECT, FROM, WHERE, GROUP BY, ORDER BY', () => {
            const query: DataPreviewQuery = {
                objectName: 'TEST',
                objectType: 'table',
                fields: ['A', 'B'],
                filters: [{ type: 'basic', field: 'C', value: '1', operator: '=' }],
                sortings: [{ field: 'A', direction: 'ascending' }],
                aggregations: [{ field: 'B', function: 'count' }],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            const sql = result?.sqlQuery ?? '';

            const selectIdx = sql.indexOf('select');
            const fromIdx = sql.indexOf('from');
            const whereIdx = sql.indexOf('where');
            const groupIdx = sql.indexOf('group by');
            const orderIdx = sql.indexOf('order by');

            expect(selectIdx).toBeLessThan(fromIdx);
            expect(fromIdx).toBeLessThan(whereIdx);
            expect(whereIdx).toBeLessThan(groupIdx);
            expect(groupIdx).toBeLessThan(orderIdx);
        });

        it('should prefix fields with main~ alias', () => {
            const query: DataPreviewQuery = {
                objectName: 'TEST',
                objectType: 'table',
                fields: ['FIELD1', 'FIELD2', 'FIELD3'],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result?.sqlQuery).toContain('main~FIELD1');
            expect(result?.sqlQuery).toContain('main~FIELD2');
            expect(result?.sqlQuery).toContain('main~FIELD3');
        });

        it('should alias table as main', () => {
            const query: DataPreviewQuery = {
                objectName: 'MY_TABLE',
                objectType: 'table',
                fields: ['COL1'],
            };
            const [result, error] = buildSQLQuery(query);

            expect(error).toBeNull();
            expect(result?.sqlQuery).toContain('from MY_TABLE as main');
        });
    });
});
