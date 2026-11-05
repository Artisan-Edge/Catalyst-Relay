/**
 * Unit Tests for wrapSqlLines
 *
 * ADT's data preview endpoints cut the body into 255-character lines, so a long one-line query broke
 * mid-token ("Boolean expression expected", "Only one SELECT"). Lines must be wrapped at whitespace:
 * - Short lines and existing line breaks are kept
 * - Every output line is at most 255 characters
 * - Never inside a '…' or `…` literal (doubled quotes included); a broken " comment stays a comment
 */

import { describe, it, expect } from 'bun:test';
import { wrapSqlLines, MAX_SQL_LINE_LENGTH } from '../../../../core/adt/data_extraction/wrapSqlLines';

const longInList = (count: number) => Array.from({ length: count }, (_, i) => `'VALUE_${String(i).padStart(4, '0')}'`).join(', ');

describe('wrapSqlLines', () => {
    it('keeps short queries and their line breaks as they are', () => {
        expect(wrapSqlLines('SELECT * FROM t000')).toBe('SELECT * FROM t000');
        expect(wrapSqlLines('SELECT *\r\nFROM t000\nWHERE mandt = \'000\'')).toBe('SELECT *\nFROM t000\nWHERE mandt = \'000\'');
    });

    it('wraps a long single-line query into lines of at most 255 characters without changing its tokens', () => {
        const sql = `SELECT obj_name, object FROM tadir WHERE obj_name IN ( ${longInList(40)} ) AND object = 'CLAS'`;
        expect(sql.length).toBeGreaterThan(600);

        const lines = wrapSqlLines(sql).split('\n');

        expect(lines.length).toBeGreaterThan(2);
        expect(lines.every(line => line.length <= MAX_SQL_LINE_LENGTH)).toBe(true);
        expect(lines.join(' ')).toBe(sql);
    });

    it('never breaks inside a string literal, even one full of spaces', () => {
        const literal = `'${'a b '.repeat(40)}'`;
        const sql = `SELECT * FROM t000 WHERE ${'mandt <> \'999\' AND '.repeat(8)}mtext = ${literal} AND mandt = 'x'`;

        const lines = wrapSqlLines(sql).split('\n');

        expect(lines.some(line => line.includes(literal))).toBe(true);
        expect(lines.every(line => line.length <= MAX_SQL_LINE_LENGTH)).toBe(true);
    });

    it("treats a doubled quote as part of the literal", () => {
        const literal = `'it''s ${'x '.repeat(60)}'`;
        const sql = `${'SELECT * FROM t000 WHERE mandt <> \'1\' AND '.repeat(3)}mtext = ${literal}`;

        expect(wrapSqlLines(sql).split('\n').some(line => line.includes(literal))).toBe(true);
    });

    it('keeps backquote literals whole', () => {
        const literal = `\`${'y '.repeat(60)}\``;
        const sql = `${'SELECT * FROM t000 WHERE mandt <> \'1\' AND '.repeat(4)}mtext = ${literal}`;

        expect(wrapSqlLines(sql).split('\n').some(line => line.includes(literal))).toBe(true);
    });

    it('continues a wrapped " comment as a comment', () => {
        const sql = `SELECT * FROM t000 " ${'comment words '.repeat(30)}`;

        const lines = wrapSqlLines(sql).split('\n');

        expect(lines.length).toBeGreaterThan(1);
        expect(lines.slice(1).every(line => line.startsWith('"'))).toBe(true);
        expect(lines.every(line => line.length <= MAX_SQL_LINE_LENGTH)).toBe(true);
    });

    it('leaves a stretch without whitespace whole rather than splitting it', () => {
        const sql = `SELECT * FROM t000 WHERE mtext = '${'z'.repeat(300)}'`;

        expect(wrapSqlLines(sql).split('\n')).toEqual(['SELECT * FROM t000 WHERE mtext =', `'${'z'.repeat(300)}'`]);
    });
});
