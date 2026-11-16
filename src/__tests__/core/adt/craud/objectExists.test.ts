/**
 * Unit Tests for objectExists — only HTTP 404 means missing
 */

import { describe, it, expect } from 'bun:test';
import { objectExists } from '../../../../core/adt/craud/objectExists';
import type { AdtRequestor } from '../../../../core/adt';

function requestor(status: number, body = ''): { requestor: AdtRequestor; paths: string[] } {
    const paths: string[] = [];
    return {
        paths,
        requestor: {
            request: async (options) => {
                paths.push(options.path);
                return [new Response(body, { status }), null];
            },
        },
    };
}

const SPACE = { name: 'ZSNAP_REPORTING_SPACE', extension: 'asuist' };

describe('objectExists', () => {
    it('is false on 404 and true on 200, asking for the object URI', async () => {
        const missing = requestor(404, 'Resource ZSNAP_REPORTING_SPACE does not exist');
        expect(await objectExists(missing.requestor, SPACE)).toEqual([false, null]);
        expect(missing.paths[0]).toBe('/sap/bc/adt/fiori/uisttop/zsnap_reporting_space');
        expect(await objectExists(requestor(200).requestor, SPACE)).toEqual([true, null]);
    });

    it('is an error for any other status, even when the text says not found', async () => {
        const [exists, error] = await objectExists(requestor(500, 'entry not found in table').requestor, SPACE);
        expect(exists).toBeNull();
        expect(error?.message).toContain('Failed to look up');
    });
});
