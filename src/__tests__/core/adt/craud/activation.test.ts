/**
 * Unit Tests for activation result parsing
 *
 * The parser derives status from the messages SAP returns, so a message it fails to
 * keep or attribute silently becomes a "success". Covers:
 * - Object-level errors (no source position) still mark the object failed
 * - Positioned errors keep their line/column
 * - Abort ('A') counts as an error, warnings ('W') are ignored
 * - A prefix name cannot claim a longer name's message
 * - A cancelled run (activationExecuted=false) fails the objects still inactive
 * - An object SAP is silent about is checked to exist (a deleted DCL "activated" fine)
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
// Object URIs in `missing` answer the existence GET with 404, all others with 200.
function mockRequestorFor(responses: ResultsResponse[], inactive?: ResultsResponse, missing: string[] = []): { requestor: AdtRequestor; resultsCalls: () => number } {
    let calls = 0;
    const requestor: AdtRequestor = {
        request: async (options) => {
            if (options.method === 'GET' && !options.path.includes('/activation/')) {
                return [new Response('', { status: missing.includes(options.path) ? 404 : 200 }), null];
            }
            if (options.path.includes('/activation/inactiveobjects')) {
                const answer = inactive ?? { status: 200, body: inactiveXml([]) };
                return [new Response(answer.body, { status: answer.status }), null];
            }
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

function resultsXml(messages: string, properties = ''): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<chkl:messages xmlns:chkl="http://www.sap.com/abapxml/checklist">
${properties}${messages}
</chkl:messages>`;
}

function properties(checkExecuted: boolean, activationExecuted: boolean): string {
    return `<chkl:properties checkExecuted="${checkExecuted}" activationExecuted="${activationExecuted}" generationExecuted="false"/>`;
}

// Inactive objects list naming the given classes.
function inactiveXml(classes: string[]): string {
    const entries = classes.map(name => `<ioc:entry><ioc:object ioc:user="ME" ioc:deleted="false"><ioc:ref adtcore:uri="/sap/bc/adt/oo/classes/${name.toLowerCase()}" adtcore:type="CLAS/OC" adtcore:name="${name}"/></ioc:object></ioc:entry>`).join('');
    return `<?xml version="1.0" encoding="utf-8"?><ioc:inactiveObjects xmlns:ioc="http://www.sap.com/abapxml/inactiveCtsObjects" xmlns:adtcore="http://www.sap.com/adt/core">${entries}</ioc:inactiveObjects>`;
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

describe('cancelled activation runs', () => {
    // The regression: a class with a syntax error cancels the whole run (activationExecuted=false),
    // but only it gets a message, so the other classes were reported active while still inactive.
    const cancelledXml = resultsXml([
        `<msg objDescr="" type="W" line="0" href=""><shortText><txt>Activation was cancelled.</txt></shortText></msg>`,
        message('Class ZCAT_ACT_BAD, Method RUN', 'E', 'Field "X" is unknown.', '/sap/bc/adt/oo/classes/zcat_act_bad/source/main#start=8,8'),
    ].join(''), properties(true, false));

    it('fails the objects that are still inactive after a cancelled run', async () => {
        const { requestor } = mockRequestorFor([{ status: 200, body: cancelledXml }], { status: 200, body: inactiveXml(['ZCAT_ACT_BAD', 'ZCAT_ACT_OK']) });

        const [results, error] = await activateObjects(requestor, [
            { name: 'ZCAT_ACT_BAD', extension: 'aclass' },
            { name: 'ZCAT_ACT_OK', extension: 'aclass' },
        ]);

        expect(error).toBeNull();
        expect(results!.find(r => r.name === 'ZCAT_ACT_BAD')!.messages[0]!.text).toBe('Field "X" is unknown.');
        const ok = results!.find(r => r.name === 'ZCAT_ACT_OK')!;
        expect(ok.status).toBe('error');
        expect(ok.messages[0]!.text).toContain('cancelled the activation run');
    });

    it('keeps objects that were already active as a success', async () => {
        const { requestor } = mockRequestorFor([{ status: 200, body: cancelledXml }], { status: 200, body: inactiveXml(['ZCAT_ACT_BAD']) });

        const [results] = await activateObjects(requestor, [
            { name: 'ZCAT_ACT_BAD', extension: 'aclass' },
            { name: 'ZCAT_ACT_OK', extension: 'aclass' },
        ]);

        expect(results!.find(r => r.name === 'ZCAT_ACT_OK')!.status).toBe('success');
    });

    it('fails every object without its own error when the inactive list cannot be read', async () => {
        const { requestor } = mockRequestorFor([{ status: 200, body: cancelledXml }], { status: 500, body: EXCEPTION_BODY });

        const [results] = await activateObjects(requestor, [
            { name: 'ZCAT_ACT_BAD', extension: 'aclass' },
            { name: 'ZCAT_ACT_OK', extension: 'aclass' },
        ]);

        expect(results!.every(r => r.status === 'error')).toBe(true);
    });

    it('treats a run with nothing to check (already active) as a success', async () => {
        const [results] = await activateObjects(mockRequestor(resultsXml('', properties(false, false))), [
            { name: 'ZCAT_ACT_OK', extension: 'aclass' },
        ]);

        expect(results![0]!.status).toBe('success');
    });
});

describe('objects that do not exist', () => {
    it('fails a missing access control that SAP reports as nothing to do', async () => {
        // The regression: SAP answers checkExecuted=false/activationExecuted=false with no messages
        // for a DCL that was deleted, which read as "already active"
        const { requestor } = mockRequestorFor([{ status: 200, body: resultsXml('', properties(false, false)) }], undefined, ['/sap/bc/adt/acm/dcl/sources/zcat_gone']);

        const [results] = await activateObjects(requestor, [
            { name: 'ZCAT_GONE', extension: 'asdcls' },
            { name: 'ZCAT_ACT_OK', extension: 'aclass' },
        ]);

        expect(results![0]).toEqual({ name: 'ZCAT_GONE', extension: 'asdcls', status: 'error', messages: [{ severity: 'error', text: 'Access Control ZCAT_GONE does not exist' }] });
        expect(results![1]!.status).toBe('success');
    });

    it('does not look up objects SAP reported on', async () => {
        const xml = resultsXml(message('ZCAT_ACT_BAD', 'E', 'Broken', '/sap/bc/adt/oo/classes/zcat_act_bad/source/main#start=1,1'));
        const paths: string[] = [];
        const { requestor } = mockRequestorFor([{ status: 200, body: xml }], undefined, ['/sap/bc/adt/oo/classes/zcat_act_bad']);
        const recording: AdtRequestor = { request: async options => { paths.push(options.path); return requestor.request(options); } };

        const [results] = await activateObjects(recording, [{ name: 'ZCAT_ACT_BAD', extension: 'aclass' }]);

        expect(results![0]!.messages[0]!.text).toBe('Broken');
        expect(paths).not.toContain('/sap/bc/adt/oo/classes/zcat_act_bad');
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

// Inactive list with explicit refs (URI, type, deleted flag).
function inactiveRefsXml(refs: { uri: string; type: string; name: string; deleted?: boolean }[]): string {
    const entries = refs.map(r => `<ioc:entry><ioc:object ioc:user="ME" ioc:deleted="${r.deleted ? 'true' : 'false'}"><ioc:ref adtcore:uri="${r.uri}" adtcore:type="${r.type}" adtcore:name="${r.name}"/></ioc:object></ioc:entry>`).join('');
    return `<?xml version="1.0" encoding="utf-8"?><ioc:inactiveObjects xmlns:ioc="http://www.sap.com/abapxml/inactiveCtsObjects" xmlns:adtcore="http://www.sap.com/adt/core">${entries}</ioc:inactiveObjects>`;
}

describe('activation result order and always-active types', () => {
    it('keeps input order when message classes are mixed with activated objects', async () => {
        const [results, error] = await activateObjects(mockRequestor(resultsXml('')), [
            { name: 'ZMSG_A', extension: 'asmsag' },
            { name: 'ZCL_ONE', extension: 'aclass' },
            { name: 'ZMSG_B', extension: 'asmsag' },
            { name: 'ZCL_TWO', extension: 'aclass' },
        ]);

        expect(error).toBeNull();
        expect(results!.map(r => r.name)).toEqual(['ZMSG_A', 'ZCL_ONE', 'ZMSG_B', 'ZCL_TWO']);
        expect(results![0]!.messages[0]!.severity).toBe('info');
        expect(results![1]!.messages).toEqual([]);
    });

    it('sends nothing when every object is a message class', async () => {
        let calls = 0;
        const requestor: AdtRequestor = { request: async () => { calls++; return [new Response('', { status: 500 }), null]; } };

        const [results, error] = await activateObjects(requestor, [{ name: 'ZMSG_A', extension: 'asmsag' }, { name: 'ZMSG_B', extension: 'asmsag' }]);

        expect(error).toBeNull();
        expect(results!.map(r => r.status)).toEqual(['success', 'success']);
        expect(calls).toBe(0);
    });
});

describe('cancelled run: inactive lookup', () => {
    const cancelled = resultsXml(
        message('Class ZCL_BAD', 'E', 'Syntax error', '/sap/bc/adt/oo/classes/zcl_bad/source/main#start=3,1'),
        properties(true, false),
    );

    it('matches an inactive entry by name and type when its URI differs (function group include)', async () => {
        const inactive = inactiveRefsXml([{ uri: '/sap/bc/adt/functions/groups/zfoo/includes/lzfoof01/source/main', type: 'FUGR/I', name: 'LZFOOF01' }]);
        const { requestor } = mockRequestorFor([{ status: 200, body: cancelled }], { status: 200, body: inactive });

        const [results] = await activateObjects(requestor, [
            { name: 'ZCL_BAD', extension: 'aclass' },
            { name: 'LZFOOF01', extension: 'asfinc', container: 'ZFOO' },
        ]);

        const include = results!.find(r => r.name === 'LZFOOF01')!;
        expect(include.status).toBe('error');
        expect(include.messages[0]!.text).toContain('SAP cancelled the activation run');
    });

    it('does not count deleted="true" entries as inactive', async () => {
        const inactive = inactiveRefsXml([{ uri: '/sap/bc/adt/oo/classes/zcl_gone', type: 'CLAS/OC', name: 'ZCL_GONE', deleted: true }]);
        const { requestor } = mockRequestorFor([{ status: 200, body: cancelled }], { status: 200, body: inactive });

        const [results] = await activateObjects(requestor, [
            { name: 'ZCL_BAD', extension: 'aclass' },
            { name: 'ZCL_GONE', extension: 'aclass' },
        ]);

        expect(results!.find(r => r.name === 'ZCL_GONE')!.status).toBe('success');
    });
});
