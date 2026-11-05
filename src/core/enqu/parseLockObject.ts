/**
 * Parse Lock Object — .asenqu source → LockObjectDef
 *
 * Grammar:
 *   [@EndUserText.label: '<text>']
 *   [@AllowRFC: true|false]
 *   define lock object <name> {
 *     primary table [:] <table> lock mode <E|S|X> ;
 *     [ secondary table [:] <table> lock mode <E|S|X> ; ]...
 *     lock parameters {
 *       <parameter> : <table>.<field> [not wanted] ;
 *       ...
 *     }
 *   }
 */

import type { Result } from '../../types/result';
import { ok, err } from '../../types/result';
import { DdicParseError } from '../ddic/types';
import { tokenize } from '../ddic/tokenize';
import { TokenCursor } from '../ddic/cursor';
import { LOCK_MODES } from './types';
import type { LockMode, LockObjectDef, LockParameterDef, LockTableDef } from './types';

/**
 * Parse a lock object source
 *
 * @param source - .asenqu text
 * @returns Definition, or a DdicParseError with line/column
 */
export function parseLockObject(source: string): Result<LockObjectDef, DdicParseError> {
    const [tokens, tokenErr] = tokenize(source);
    if (tokenErr) return err(tokenErr);

    try {
        return ok(parseTokens(new TokenCursor(tokens)));
    } catch (error) {
        if (error instanceof DdicParseError) return err(error);
        throw error;
    }
}

interface Annotations {
    label: string;
    allowRfc: boolean;
}

function parseTokens(cursor: TokenCursor): LockObjectDef {
    const annotations = parseAnnotations(cursor);

    cursor.expectKeyword('define', 'lock', 'object');
    const name = cursor.expectWord('a lock object name').value;
    cursor.expectPunct('{');

    let primary: LockTableDef | null = null;
    const secondary: LockTableDef[] = [];
    let parameters: LockParameterDef[] | null = null;

    while (!cursor.isPunct('}')) {
        if (cursor.isKeyword('primary', 'table')) {
            if (primary) cursor.fail("Duplicate 'primary table' clause");
            cursor.expectKeyword('primary', 'table');
            primary = parseTable(cursor);
            continue;
        }
        if (cursor.isKeyword('secondary', 'table')) {
            cursor.expectKeyword('secondary', 'table');
            secondary.push(parseTable(cursor));
            continue;
        }
        if (cursor.isKeyword('lock', 'parameters')) {
            if (parameters) cursor.fail("Duplicate 'lock parameters' block");
            cursor.expectKeyword('lock', 'parameters');
            parameters = parseParameters(cursor);
            continue;
        }
        cursor.fail("Expected 'primary table', 'secondary table' or 'lock parameters'");
    }
    cursor.expectPunct('}');
    cursor.skipOptionalSemicolon();
    cursor.expectEof();

    if (!primary) cursor.fail("Expected a 'primary table : <table> lock mode <mode>;' clause");
    if (!parameters) cursor.fail("Expected a 'lock parameters { ... }' block");

    return { name, description: annotations.label, allowRfc: annotations.allowRfc, primary, secondary, parameters };
}

// @EndUserText.label: '<text>' and @AllowRFC: true|false
function parseAnnotations(cursor: TokenCursor): Annotations {
    const result: Annotations = { label: '', allowRfc: false };
    while (cursor.isPunct('@')) {
        const at = cursor.next();
        const parts = [cursor.expectWord('an annotation name').value];
        while (cursor.isPunct('.')) {
            cursor.next();
            parts.push(cursor.expectWord('an annotation name').value);
        }
        const annotation = parts.join('.').toLowerCase();
        cursor.expectPunct(':');

        if (annotation === 'endusertext.label') {
            result.label = cursor.expectString('the label text').value;
            continue;
        }
        if (annotation === 'allowrfc') {
            const value = cursor.expectWord('true or false');
            const flag = value.value.toLowerCase();
            if (flag !== 'true' && flag !== 'false') cursor.fail('Expected true or false', value);
            result.allowRfc = flag === 'true';
            continue;
        }
        throw new DdicParseError(`Unsupported annotation @${parts.join('.')} (supported: @EndUserText.label, @AllowRFC)`, at.line, at.column);
    }
    return result;
}

// [:] <table> lock mode <mode> ;
function parseTable(cursor: TokenCursor): LockTableDef {
    if (cursor.isPunct(':')) cursor.next();
    const table = cursor.expectWord('a table name').value;
    cursor.expectKeyword('lock', 'mode');
    const modeToken = cursor.expectWord(`a lock mode (${LOCK_MODES.join(', ')})`);
    const lockMode = modeToken.value.toUpperCase();
    if (!LOCK_MODES.includes(lockMode as LockMode)) cursor.fail(`Expected a lock mode (${LOCK_MODES.join(', ')})`, modeToken);
    cursor.expectPunct(';');
    return { table, lockMode: lockMode as LockMode };
}

// { <param> : <table>.<field> [not wanted] ; ... }
function parseParameters(cursor: TokenCursor): LockParameterDef[] {
    const parameters: LockParameterDef[] = [];
    cursor.expectPunct('{');
    while (!cursor.isPunct('}')) {
        const name = cursor.expectWord('a lock parameter name').value;
        cursor.expectPunct(':');
        const table = cursor.expectWord('a table name').value;
        cursor.expectPunct('.');
        const field = cursor.expectWord('a field name').value;
        let wanted = true;
        if (cursor.isKeyword('not', 'wanted')) {
            cursor.expectKeyword('not', 'wanted');
            wanted = false;
        }
        cursor.expectPunct(';');
        parameters.push({ name, table, field, wanted });
    }
    cursor.expectPunct('}');
    cursor.skipOptionalSemicolon();
    return parameters;
}
