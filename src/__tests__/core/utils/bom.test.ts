/**
 * Unit Tests for the BOM and JSON helpers shared by every source parse
 */

import { describe, it, expect } from 'bun:test';
import { BOM, stripBom } from '../../../core/utils/bom';
import { safeJsonParse } from '../../../core/utils/json';
import { normalizeContent } from '../../../core/utils/content';

describe('stripBom', () => {
    it('drops only a leading BOM', () => {
        expect(BOM).toBe('﻿');
        expect(stripBom('﻿abc')).toBe('abc');
        expect(stripBom('a﻿bc')).toBe('a﻿bc');
        expect(stripBom('abc')).toBe('abc');
    });
});

describe('safeJsonParse', () => {
    it('parses JSON with a BOM and reports invalid JSON as an error', () => {
        expect(safeJsonParse('﻿{"a":1}')).toEqual([{ a: 1 }, null]);
        expect(safeJsonParse('{"a":')[1]?.message).toContain('Invalid JSON');
    });
});

describe('normalizeContent', () => {
    it('ignores a BOM', () => {
        expect(normalizeContent('﻿REPORT z.\r\n')).toBe(normalizeContent('REPORT z.'));
    });
});
