/**
 * Unit Tests for searchObjects maxResults
 *
 * The regression: maxResults was always 10001 and callers cut the list afterwards, so a wide pattern
 * with a small limit took minutes. The limit must reach SAP's quick search.
 */

import { describe, it, expect } from 'bun:test';
import { searchObjects } from '../../../../core/adt/discovery/searchObjects';
import type { AdtRequestor } from '../../../../core/adt';

const EMPTY = '<?xml version="1.0" encoding="utf-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"/>';

function recorder(): { requestor: AdtRequestor; paths: string[] } {
    const paths: string[] = [];
    const requestor: AdtRequestor = {
        request: async (options) => {
            paths.push(options.path);
            return [new Response(EMPTY, { status: 200 }), null];
        },
    };
    return { requestor, paths };
}

const maxResultsOf = (path: string) => new URLSearchParams(path.split('?')[1]).get('maxResults');

describe('searchObjects maxResults', () => {
    it('sends the requested maxResults to the quick search', async () => {
        const { requestor, paths } = recorder();
        const [results, error] = await searchObjects(requestor, 'Z*', { maxResults: 10 });

        expect(error).toBeNull();
        expect(results).toEqual([]);
        expect(maxResultsOf(paths[0]!)).toBe('10');
    });

    it('defaults to 10001', async () => {
        const { requestor, paths } = recorder();
        await searchObjects(requestor, 'Z*');

        expect(maxResultsOf(paths[0]!)).toBe('10001');
    });

    it('refuses a maxResults that is not a positive integer', async () => {
        const { requestor, paths } = recorder();

        for (const maxResults of [0, -1, 2.5]) {
            const [, error] = await searchObjects(requestor, 'Z*', { maxResults });
            expect(error?.message).toContain('maxResults');
        }
        expect(paths).toHaveLength(0);
    });
});
