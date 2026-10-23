/**
 * Parse Data Element — .asdtel source → DataElementDef
 *
 * Grammar (S4-Views docs/03-repository/data-elements-and-domains.md):
 *   [@EndUserText.label: '<text>']
 *   define data element <name> {
 *     ( data type : abap.<type>[(len[,dec])] ; | domain : <name> ; )
 *     [ labels { (short|medium|long|heading) : '<text>' ; ... } ]
 *   }
 */

import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';
import type { AbapType, DataElementDef, DataElementLabels } from './types';
import { DdicParseError } from './types';
import { tokenize } from './tokenize';
import { TokenCursor } from './cursor';

const LABEL_KEYS = ['short', 'medium', 'long', 'heading'] as const;

/**
 * Parse a data element source
 *
 * @param source - .asdtel text
 * @returns Definition, or a DdicParseError with line/column
 */
export function parseDataElement(source: string): Result<DataElementDef, DdicParseError> {
    const [tokens, tokenErr] = tokenize(source);
    if (tokenErr) return err(tokenErr);

    try {
        return ok(parseTokens(new TokenCursor(tokens)));
    } catch (error) {
        if (error instanceof DdicParseError) return err(error);
        throw error;
    }
}

function parseTokens(cursor: TokenCursor): DataElementDef {
    const annotationLabel = cursor.parseAnnotations();

    // Header.
    cursor.expectKeyword('define', 'data', 'element');
    const name = cursor.expectWord('a data element name').value;
    cursor.expectPunct('{');

    // Body clauses, each at most once.
    let dataType: AbapType | null = null;
    let domain: string | null = null;
    const labels: DataElementLabels = { short: '', medium: '', long: '', heading: '' };
    let seenLabels = false;

    while (!cursor.isPunct('}')) {
        const clause = cursor.peek();

        if (cursor.isKeyword('data', 'type')) {
            if (dataType || domain) cursor.fail("Only one 'data type' or 'domain' clause is allowed", clause);
            cursor.expectKeyword('data', 'type');
            cursor.expectPunct(':');
            dataType = cursor.parseAbapType();
            cursor.expectPunct(';');
            continue;
        }

        if (cursor.isKeyword('domain')) {
            if (dataType || domain) cursor.fail("Only one 'data type' or 'domain' clause is allowed", clause);
            cursor.next();
            cursor.expectPunct(':');
            domain = cursor.expectWord('a domain name').value;
            cursor.expectPunct(';');
            continue;
        }

        if (cursor.isKeyword('labels')) {
            if (seenLabels) cursor.fail("Duplicate 'labels' block", clause);
            seenLabels = true;
            cursor.next();
            parseLabels(cursor, labels);
            continue;
        }

        cursor.fail("Expected 'data type', 'domain' or 'labels'");
    }
    cursor.expectPunct('}');
    cursor.skipOptionalSemicolon();
    cursor.expectEof();

    if (!dataType && !domain) cursor.fail("Expected a 'data type : ...;' or 'domain : ...;' clause");

    return {
        name,
        description: annotationLabel ?? labels.long,
        dataType,
        domain,
        labels,
    };
}

function parseLabels(cursor: TokenCursor, labels: DataElementLabels): void {
    cursor.expectPunct('{');
    const seen = new Set<string>();
    while (!cursor.isPunct('}')) {
        const keyToken = cursor.expectWord(`a label key (${LABEL_KEYS.join(', ')})`);
        const key = keyToken.value.toLowerCase();
        if (!isLabelKey(key)) cursor.fail(`Unknown label key, expected one of ${LABEL_KEYS.join(', ')}`, keyToken);
        if (seen.has(key)) cursor.fail(`Duplicate label '${key}'`, keyToken);
        seen.add(key);
        cursor.expectPunct(':');
        labels[key] = cursor.expectString('the label text').value;
        cursor.expectPunct(';');
    }
    cursor.expectPunct('}');
    cursor.skipOptionalSemicolon();
}

function isLabelKey(key: string): key is keyof DataElementLabels {
    return (LABEL_KEYS as readonly string[]).includes(key);
}
