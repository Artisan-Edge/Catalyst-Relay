/**
 * Unit Tests for activation result parsing
 *
 * The parser derives status from the messages SAP returns, so a message it fails to
 * keep or attribute silently becomes a "success". Covers:
 * - Object-level errors (no source position) still mark the object failed
 * - Positioned errors keep their line/column
 * - Abort ('A') counts as an error, warnings ('W') are ignored
 * - A prefix name cannot claim a longer name's message
 */

import { describe, it, expect } from 'bun:test';
import { activateObjects } from '../../../../core/adt/craud/activation';
import type { AdtRequestor } from '../../../../core/adt';

const RUN_ID = 'run123';

interface ResultsResponse {
    status: number;
    body: string;
}

// Serves the three-step flow, returning queued results responses in order so a retry can
// see a different answer than the first attempt.
function mockRequestorFor(responses: ResultsResponse[]): { requestor: AdtRequestor; resultsCalls: () => number } {
    let calls = 0;
    const requestor: AdtRequestor = {
        request: async (options) => {
            if (options.method === 'POST') {
                const headers = new Headers({ location: `/sap/bc/adt/activation/runs/${RUN_ID}` });
                return [new Response('', { status: 202, headers }), null];
            }
            if (options.path.includes('/activation/runs/')) {
                return [new Response('', { status: 200 }), null];
            }

            const next = responses[Math.min(calls, responses.length - 1)]!;
            calls++;
            return [new Response(next.body, { status: next.status }), null];
        },
    };
    return { requestor, resultsCalls: () => calls };
}

function mockRequestor(resultsXml: string): AdtRequestor {
    return mockRequestorFor([{ status: 200, body: resultsXml }]).requestor;
}

function resultsXml(messages: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">
${messages}
</chkl:messages>`;
}

function message(objDescr: string, type: string, text: string, href: string): string {
    return `<msg objDescr="${objDescr}" type="${type}" href="${href}"><shortText><txt>${text}</txt></shortText></msg>`;
}

describe('activateObjects result parsing', () => {
    it('marks an object failed when its error message carries no source position', async () => {
        // The regression: a DCL that cannot bind to an inactive view reports an
        // object-level error with no #start= fragment. Dropping it reported success
        // while the access control stayed inactive.
        const xml = resultsXml(message(
            'Access Control ZSNAP_M00S_C01',
            'E',
            'Entity ZSNAP_M00S_C01 is inactive',
            '/sap/bc/adt/acm/dcl/sources/zsnap_m00s_c01',
        ));

        const [results, error] = await activateObjects(mockRequestor(xml), [
            { name: 'ZSNAP_M00S_C01', extension: 'asdcls' },
        ]);

        expect(error).toBeNull();
        expect(results![0]!.status).toBe('error');
        expect(results![0]!.messages[0]!.text).toBe('Entity ZSNAP_M00S_C01 is inactive');
        expect(results![0]!.messages[0]!.line).toBeUndefined();
    });

    it('keeps line and column when the message is positioned', async () => {
        const xml = resultsXml(message(
            'View ZSNAP_M00S_C01',
            'E',
            'Field MATERIAL is unknown',
            '/sap/bc/adt/ddic/ddl/sources/zsnap_m00s_c01#start=12,5',
        ));

        const [results] = await activateObjects(mockRequestor(xml), [
            { name: 'ZSNAP_M00S_C01', extension: 'asddls' },
        ]);

        expect(results![0]!.status).toBe('error');
        expect(results![0]!.messages[0]!.line).toBe(12);
        expect(results![0]!.messages[0]!.column).toBe(5);
    });

    it('treats abort as an error and ignores warnings', async () => {
        const xml = resultsXml([
            message('View ZVIEW_A', 'A', 'Activation aborted', '/sap/bc/adt/ddic/ddl/sources/zview_a'),
            message('View ZVIEW_B', 'W', 'Deprecated annotation', '/sap/bc/adt/ddic/ddl/sources/zview_b'),
        ].join('\n'));

        const [results] = await activateObjects(mockRequestor(xml), [
            { name: 'ZVIEW_A', extension: 'asddls' },
            { name: 'ZVIEW_B', extension: 'asddls' },
        ]);

        expect(results!.find(r => r.name === 'ZVIEW_A')!.status).toBe('error');
        expect(results!.find(r => r.name === 'ZVIEW_B')!.status).toBe('success');
    });

    it('attributes a message to the longest matching name, not a prefix', async () => {
        const xml = resultsXml(message(
            'View ZVIEW_C011',
            'E',
            'Syntax error',
            '/sap/bc/adt/ddic/ddl/sources/zview_c011',
        ));

        const [results] = await activateObjects(mockRequestor(xml), [
            { name: 'ZVIEW_C01', extension: 'asddls' },
            { name: 'ZVIEW_C011', extension: 'asddls' },
        ]);

        expect(results!.find(r => r.name === 'ZVIEW_C01')!.status).toBe('success');
        expect(results!.find(r => r.name === 'ZVIEW_C011')!.status).toBe('error');
    });

    it('reports success when SAP returns no messages', async () => {
        const [results] = await activateObjects(mockRequestor(resultsXml('')), [
            { name: 'ZVIEW_OK', extension: 'asddls' },
        ]);

        expect(results![0]!.status).toBe('success');
        expect(results![0]!.messages).toHaveLength(0);
    });
});

const EXCEPTION_BODY = '<exc><localizedMessage>An exception was raised</localizedMessage></exc>';

describe('activation results retry', () => {
    it('retries a transient 500 and uses the second answer', async () => {
        // "Failed to fetch activation results: An exception was raised" aborted the whole
        // run; a plain retry succeeded.
        const { requestor, resultsCalls } = mockRequestorFor([
            { status: 500, body: EXCEPTION_BODY },
            { status: 200, body: resultsXml('') },
        ]);

        const [results, error] = await activateObjects(requestor, [{ name: 'ZVIEW_OK', extension: 'asddls' }]);

        expect(error).toBeNull();
        expect(results![0]!.status).toBe('success');
        expect(resultsCalls()).toBe(2);
    }, 10_000);

    it('does not retry a 4xx', async () => {
        const { requestor, resultsCalls } = mockRequestorFor([{ status: 404, body: EXCEPTION_BODY }]);

        const [, error] = await activateObjects(requestor, [{ name: 'ZVIEW_OK', extension: 'asddls' }]);

        expect(error).not.toBeNull();
        expect(resultsCalls()).toBe(1);
    });

    it('gives up after three attempts', async () => {
        const { requestor, resultsCalls } = mockRequestorFor([{ status: 500, body: EXCEPTION_BODY }]);

        const [, error] = await activateObjects(requestor, [{ name: 'ZVIEW_OK', extension: 'asddls' }]);

        expect(error?.message).toContain('after 3 attempts');
        expect(resultsCalls()).toBe(3);
    }, 15_000);
});
