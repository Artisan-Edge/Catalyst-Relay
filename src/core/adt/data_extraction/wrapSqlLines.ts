/**
 * Wrap SQL Lines — keep every line of an ADT data preview query within 255 characters
 *
 * The data preview endpoints cut the request body into 255-character lines, splitting tokens
 * ("Boolean expression expected", "Only one SELECT"). Long lines are broken at whitespace
 * instead, never inside a '…' or `…` literal; a break inside a " comment continues the comment.
 */

export const MAX_SQL_LINE_LENGTH = 255;

const COMMENT_CONTINUATION = '" ';

type ScanState = 'code' | 'literal' | 'comment';

interface BreakPoint {
    /** Index of the whitespace character the line breaks at (dropped from the output) */
    index: number;
    inComment: boolean;
}

/**
 * Break lines longer than maxLength at whitespace outside string literals
 *
 * Lines that already fit are kept as they are. A stretch with no break point (a literal longer
 * than the limit) is left whole for SAP to reject.
 */
export function wrapSqlLines(sql: string, maxLength = MAX_SQL_LINE_LENGTH): string {
    return sql.split(/\r?\n/).flatMap(line => wrapLine(line, maxLength)).join('\n');
}

function wrapLine(line: string, maxLength: number): string[] {
    if (line.length <= maxLength) return [line];

    const breaks = breakPoints(line);
    const lines: string[] = [];
    let start = 0;
    let prefix = '';
    while (prefix.length + line.length - start > maxLength) {
        const limit = start + maxLength - prefix.length;
        const candidates = breaks.filter(point => point.index > start && point.index <= limit);
        const point = candidates[candidates.length - 1] ?? breaks.find(candidate => candidate.index > start);
        if (!point) break;

        lines.push(prefix + line.slice(start, point.index));
        start = point.index + 1;
        prefix = point.inComment ? COMMENT_CONTINUATION : '';
    }
    lines.push(prefix + line.slice(start));
    return lines;
}

// Whitespace a line may break at: outside literals, and not at the very start of a comment
function breakPoints(line: string): BreakPoint[] {
    const points: BreakPoint[] = [];
    let state: ScanState = 'code';
    let quote = '';

    // A * in the first column makes the whole line a comment
    if (line.startsWith('*')) state = 'comment';

    for (let index = 0; index < line.length; index++) {
        const char = line[index]!;
        if (state === 'literal') {
            if (char !== quote) continue;
            // A doubled quote is an escaped quote inside the literal
            if (line[index + 1] === quote) {
                index++;
                continue;
            }
            state = 'code';
            continue;
        }
        if (state === 'code' && (char === '\'' || char === '`')) {
            state = 'literal';
            quote = char;
            continue;
        }
        if (state === 'code' && char === '"') {
            state = 'comment';
            continue;
        }
        if (/\s/.test(char)) points.push({ index, inComment: state === 'comment' });
    }
    return points;
}
