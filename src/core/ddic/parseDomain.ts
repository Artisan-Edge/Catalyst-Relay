/**
 * Parse Domain — .asdoma source → DomainDef
 *
 * Grammar (S4-Views docs/03-repository/data-elements-and-domains.md):
 *   [@EndUserText.label: '<text>']
 *   define domain <name> {
 *     data type : abap.<type>[(len[,dec])] ;
 *     [ output length : <n> ; ]
 *     [ case sensitive ; ]
 *     [ sign ; ]
 *     [ conversion routine : <ROUTINE> ; ]
 *     [ value table : <table> ; ]
 *     [ fixed values { '<key>' [to '<high>'] : '<text>' ; ... } ]
 *   }
 * Clauses may appear in any order, each at most once.
 */

import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';
import type { AbapType, DomainDef, FixedValue } from './types';
import { DdicParseError } from './types';
import { tokenize } from './tokenize';
import { TokenCursor } from './cursor';

/**
 * Parse a domain source
 *
 * @param source - .asdoma text
 * @returns Definition, or a DdicParseError with line/column
 */
export function parseDomain(source: string): Result<DomainDef, DdicParseError> {
    const [tokens, tokenErr] = tokenize(source);
    if (tokenErr) return err(tokenErr);

    try {
        return ok(parseTokens(new TokenCursor(tokens)));
    } catch (error) {
        if (error instanceof DdicParseError) return err(error);
        throw error;
    }
}

function parseTokens(cursor: TokenCursor): DomainDef {
    const annotationLabel = cursor.parseAnnotations();

    // Header.
    cursor.expectKeyword('define', 'domain');
    const name = cursor.expectWord('a domain name').value;
    cursor.expectPunct('{');

    let dataType: AbapType | null = null;
    let outputLength: number | null = null;
    let caseSensitive = false;
    let signed = false;
    let conversionRoutine = '';
    let valueTable = '';
    let fixedValues: FixedValue[] = [];
    const seen = new Set<string>();

    // Reject a second occurrence of the same clause.
    const once = (clause: string): void => {
        if (seen.has(clause)) cursor.fail(`Duplicate '${clause}' clause`);
        seen.add(clause);
    };

    while (!cursor.isPunct('}')) {
        if (cursor.isKeyword('data', 'type')) {
            once('data type');
            cursor.expectKeyword('data', 'type');
            cursor.expectPunct(':');
            dataType = cursor.parseAbapType();
            cursor.expectPunct(';');
            continue;
        }

        if (cursor.isKeyword('output', 'length')) {
            once('output length');
            cursor.expectKeyword('output', 'length');
            cursor.expectPunct(':');
            outputLength = cursor.expectNumber('an output length');
            cursor.expectPunct(';');
            continue;
        }

        if (cursor.isKeyword('case', 'sensitive')) {
            once('case sensitive');
            cursor.expectKeyword('case', 'sensitive');
            cursor.expectPunct(';');
            caseSensitive = true;
            continue;
        }

        if (cursor.isKeyword('sign')) {
            once('sign');
            cursor.next();
            cursor.expectPunct(';');
            signed = true;
            continue;
        }

        if (cursor.isKeyword('conversion', 'routine')) {
            once('conversion routine');
            cursor.expectKeyword('conversion', 'routine');
            cursor.expectPunct(':');
            conversionRoutine = cursor.expectWord('a conversion routine name').value;
            cursor.expectPunct(';');
            continue;
        }

        if (cursor.isKeyword('value', 'table')) {
            once('value table');
            cursor.expectKeyword('value', 'table');
            cursor.expectPunct(':');
            valueTable = cursor.expectWord('a value table name').value;
            cursor.expectPunct(';');
            continue;
        }

        if (cursor.isKeyword('fixed', 'values')) {
            once('fixed values');
            cursor.expectKeyword('fixed', 'values');
            fixedValues = parseFixedValues(cursor);
            continue;
        }

        cursor.fail("Expected a domain clause ('data type', 'output length', 'case sensitive', 'sign', 'conversion routine', 'value table' or 'fixed values')");
    }
    cursor.expectPunct('}');
    cursor.skipOptionalSemicolon();
    cursor.expectEof();

    if (!dataType) cursor.fail("Expected a 'data type : ...;' clause");

    return {
        name,
        description: annotationLabel ?? '',
        dataType,
        outputLength,
        caseSensitive,
        signed,
        conversionRoutine,
        valueTable,
        fixedValues,
    };
}

function parseFixedValues(cursor: TokenCursor): FixedValue[] {
    const values: FixedValue[] = [];
    cursor.expectPunct('{');
    while (!cursor.isPunct('}')) {
        const low = cursor.expectString('a fixed value').value;
        let high = '';
        if (cursor.isKeyword('to')) {
            cursor.next();
            high = cursor.expectString('the upper bound of the range').value;
        }
        cursor.expectPunct(':');
        const text = cursor.expectString('the fixed value text').value;
        cursor.expectPunct(';');
        values.push({ low, high, text });
    }
    cursor.expectPunct('}');
    cursor.skipOptionalSemicolon();
    return values;
}
